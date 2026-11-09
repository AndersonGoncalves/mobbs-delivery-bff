import type { Request, Response, Server } from 'restify';
import { UnauthorizedError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { isValidWebhookToken } from '../../../shared/crypto/webhook-token';
import type { ISubscriptionEventRepository } from '../domain/repositories/subscription-event.repository.interface';
import type { ISubscriptionObligationRepository } from '../domain/repositories/subscription-obligation.repository.interface';
import type { PlatformBillingCycleService } from '../domain/services/platform-billing-cycle.service';
import type { IObligationPaymentObserver } from '../domain/services/i-obligation-payment-observer.interface';

// Mesmos eventos reais do Asaas verificados em docs.asaas.com (2026-10-27) — ver tasks.md
// "Achados de leitura de código".
const PAID_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);
const REFUNDED_EVENTS = new Set(['PAYMENT_REFUNDED']);
const OVERDUE_EVENTS = new Set(['PAYMENT_OVERDUE']);

interface AsaasPaymentWebhookBody {
  id?: string;
  event?: string;
  payment?: { id?: string; externalReference?: string };
}

/**
 * specs/0175-cobranca-assinatura-asaas REQ-19/REQ-20/REQ-21 — webhook da ASSINATURA DA
 * PLATAFORMA (`POST /webhooks/platform-billing`), credencial/endpoint PRÓPRIOS — nunca o mesmo
 * token/rota por-restaurante de `specs/0101`/`specs/0170` (essas são pagamento de PEDIDO, não
 * assinatura). `externalReference` é o id da OBLIGATION (não de pedido, ver `plan.md`).
 *
 * Idempotência por `(obligationId, asaasEventId)` — índice único de `SubscriptionEvent`
 * (REQ-20/AC-15): reenvio do MESMO evento nunca reaplica a baixa. Referência desconhecida ou
 * token inválido nunca libera acesso (REQ-19) — responde 200 pra evento reconhecido mas
 * irrelevante, igual ao padrão já usado em `AsaasWebhookController`.
 */
export class PlatformBillingWebhookController extends BaseRouter {
  constructor(
    private readonly deps: {
      obligationRepository: ISubscriptionObligationRepository;
      subscriptionEventRepository: ISubscriptionEventRepository;
      platformBillingCycleService: PlatformBillingCycleService;
      webhookToken: string;
      // specs/0205-comissao-revendedor plan.md — notificados depois de markPaid/markRefunded;
      // `platform-billing` não conhece quem os implementa (hoje, `resellers`).
      observers: IObligationPaymentObserver[];
    },
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.post('/webhooks/platform-billing', async (req: Request, res: Response) => {
      const token = req.header('asaas-access-token');
      if (!isValidWebhookToken(token, this.deps.webhookToken)) {
        throw new UnauthorizedError('Token de webhook inválido');
      }

      const body = req.body as AsaasPaymentWebhookBody;
      const obligationId = body.payment?.externalReference;
      if (!body.event || !obligationId) {
        res.send(200);
        return;
      }

      const obligation = await this.deps.obligationRepository.findById(obligationId);
      if (!obligation) {
        // Referência desconhecida — nunca libera nada, só ignora (REQ-19).
        res.send(200);
        return;
      }

      const { wasAlreadyRecorded } = await this.deps.subscriptionEventRepository.append({
        obligationId: obligation.id,
        type: 'webhook_received',
        payload: body as unknown as Record<string, unknown>,
        asaasEventId: body.id,
        actor: 'system',
      });
      if (wasAlreadyRecorded) {
        res.json(200, { obligationId: obligation.id, status: obligation.status });
        return;
      }

      const now = new Date();
      if (PAID_EVENTS.has(body.event) && obligation.status !== 'paid') {
        await this.deps.obligationRepository.markPaid(obligation.id, now);
        for (const observer of this.deps.observers) await observer.onObligationPaid(obligation);
      } else if (REFUNDED_EVENTS.has(body.event) && obligation.status !== 'refunded') {
        // Achado de auditoria (06/11/2026) — diferente dos outros dois branches, este não checava
        // o status atual antes de agir: um reenvio do evento (com asaasEventId diferente, passando
        // pela dedup acima) chamava onObligationRefunded de novo numa obrigação já estornada,
        // dependendo inteiramente de cada observer (ex. comissão de revendedor) ser idempotente
        // por conta própria.
        await this.deps.obligationRepository.markRefunded(obligation.id);
        for (const observer of this.deps.observers) await observer.onObligationRefunded(obligation);
      } else if (OVERDUE_EVENTS.has(body.event) && obligation.status !== 'overdue' && obligation.status !== 'paid') {
        // Achado de auditoria (06/11/2026, confirmado 09/11/2026) — o Asaas não garante ordem de
        // entrega de webhook: um PAYMENT_OVERDUE chegando DEPOIS de um PAYMENT_CONFIRMED/RECEIVED
        // já processado não pode rebaixar quem já pagou (bloquearia um cliente recém-pago na hora,
        // via recomputeAndPersist síncrono logo abaixo).
        await this.deps.obligationRepository.markOverdue(obligation.id);
      }

      // REQ-21 — recalcula e libera o acesso NA HORA, sem esperar o próximo ciclo.
      await this.deps.platformBillingCycleService.recomputeAndPersist(obligation.restaurantId, now);

      const refreshed = await this.deps.obligationRepository.findById(obligation.id);
      res.json(200, { obligationId: refreshed!.id, status: refreshed!.status });
    });
  }
}
