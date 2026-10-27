import type { Request, Response, Server } from 'restify';
import { ConflictError, NotFoundError, UnauthorizedError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { environment } from '../../../shared/config/environment';
import { IWhatsAppNotificationService } from '../../notifications/domain/services/i-whatsapp-notification.service';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IPayment, PaymentMethod } from '../../orders/domain/entities/order.entity';
import { ConfirmOnlinePaymentService } from '../../orders/domain/services/confirm-online-payment.service';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IPaymentRepository } from '../../orders/domain/repositories/payment.repository.interface';
import { AsaasClient } from '../infra/asaas-client';

const PIX_PAID_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);
// specs/0101-integracao-asaas (fase 2).
const CHECKOUT_PAID_EVENTS = new Set(['CHECKOUT_PAID']);

/**
 * specs/0101-integracao-asaas (fase 1) — recebe os webhooks de pagamento do Asaas (formato
 * nativo: `{ id, event, dateCreated, payment: {...} }`, conferido na documentação oficial, NÃO
 * o contrato gateway-agnóstico genérico de `specs/0140` — esse continua existindo separado, pra
 * qualquer gateway simples que já consiga falar `{ orderId, status }` direto). Autenticado pelo
 * header `asaas-access-token` (configurado na criação da subconta, `AsaasOnboardingController`),
 * sem token Firebase nem operador logado — quem chama é o Asaas.
 *
 * specs/0101-integracao-asaas (fase 2) — mesmo endpoint/token também recebe `CHECKOUT_PAID`
 * (`{ event, checkout: { externalReference, ... } }`, webhook ADICIONAL registrado sob demanda
 * em `OrdersController.tryCreateAsaasCheckout`, nunca o de Pix da fase 1) — formato de payload
 * diferente (`checkout`, não `payment`), por isso a extração do `orderId` é resolvida por evento.
 *
 * Responde 200 pra qualquer evento reconhecido (mesmo os que não acionam nada) — devolver erro
 * pra um evento que só não nos interessa faria o Asaas reentregar/alertar sem motivo.
 */
export class AsaasWebhookController extends BaseRouter {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly paymentRepository: IPaymentRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly whatsAppNotificationService: IWhatsAppNotificationService,
  ) {
    super();
  }

  private toPaymentSummary(payment: IPayment): Pick<IPayment, 'method' | 'status'> {
    return { method: payment.method, status: payment.status };
  }

  /** Resolve o `orderId` e o `PaymentMethod` esperado a partir do formato de payload do evento —
   * `payment.externalReference` pros eventos de Pix (fase 1), `checkout.externalReference` pros
   * de checkout de cartão (fase 2). Evento não reconhecido devolve `null` (ignorado, 200). */
  private resolveFromEvent(
    event: string | undefined,
    body: { payment?: { externalReference?: string }; checkout?: { externalReference?: string } },
  ): { orderId: string; expectedMethod: PaymentMethod } | null {
    if (event && PIX_PAID_EVENTS.has(event) && body.payment?.externalReference) {
      return { orderId: body.payment.externalReference, expectedMethod: 'pix' };
    }
    if (event && CHECKOUT_PAID_EVENTS.has(event) && body.checkout?.externalReference) {
      return { orderId: body.checkout.externalReference, expectedMethod: 'creditCardOnline' };
    }
    return null;
  }

  /** specs/0101-integracao-asaas (fase 2) — o id do CHECKOUT (persistido em `externalReference`
   * na criação, `tryCreateAsaasCheckout`) não é um pagamento de verdade — resolve e persiste o id
   * do pagamento REAL antes de responder, pra `tryRefundOrderCardOnlineViaAsaas` conseguir
   * estornar depois. Falha aqui não desfaz a confirmação já aplicada (o cliente já pagou); só
   * fica sem o id resolvido — resolver manualmente se isso acontecer. */
  private async resolveAsaasChargeIdAfterCheckoutPaid(restaurantApiKey: string, orderId: string): Promise<void> {
    try {
      const client = new AsaasClient(restaurantApiKey, environment.asaas.baseUrl);
      const realPayment = await client.findPaymentByExternalReference(orderId);
      if (realPayment) await this.paymentRepository.updateExternalReference(orderId, realPayment.id);
    } catch (error) {
      console.error(`[asaas] erro inesperado resolvendo o id do pagamento real do checkout do pedido ${orderId} — estorno futuro pode precisar de ação manual:`, error);
    }
  }

  initializeRoutes(application: Server): void {
    // Sem middleware de autenticação separado (diferente de `payment-webhook-api-key.middleware.ts`,
    // que resolve o restaurante A PARTIR da chave): aqui o restaurante já vem no path (é como o
    // Asaas identifica qual subconta o webhook pertence, definido na URL registrada em
    // `AsaasOnboardingController`) — a validação é só "o header bate com o token DESSE
    // restaurante", então fica inline no handler.
    application.post('/webhooks/asaas/:restaurantId', async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.params.restaurantId);
      const token = req.header('asaas-access-token');
      if (!restaurant || !restaurant.asaasWebhookToken || token !== restaurant.asaasWebhookToken) {
        throw new UnauthorizedError('Token de webhook inválido');
      }

      const body = req.body as { event?: string; payment?: { externalReference?: string }; checkout?: { externalReference?: string } };
      const resolved = this.resolveFromEvent(body.event, body);
      if (!resolved) {
        res.send(200);
        return;
      }
      const { orderId, expectedMethod } = resolved;

      const order = await this.orderRepository.findById(orderId);
      if (!order || order.restaurantId !== restaurant.id) {
        throw new NotFoundError('Pedido não encontrado');
      }

      const payment = await this.paymentRepository.findByOrderId(order.id);
      if (!payment || payment.method !== expectedMethod) {
        throw new ConflictError(`Pedido não tem pagamento ${expectedMethod === 'pix' ? 'Pix' : 'de cartão online'} pendente`);
      }

      // Idempotência (delivery `at-least-once`, confirmado na documentação do Asaas): um reenvio
      // do mesmo evento pro mesmo pedido já aprovado é sucesso, não erro.
      if (payment.status === 'aprovado') {
        res.json(200, { ...order, payment: this.toPaymentSummary(payment) });
        return;
      }
      if (payment.status !== 'pendente') {
        throw new ConflictError('Pagamento não pode ser confirmado');
      }

      const { order: updatedOrder, payment: updatedPayment } = await new ConfirmOnlinePaymentService(
        this.paymentRepository,
        this.orderRepository,
        this.restaurantRepository,
        this.whatsAppNotificationService,
      ).confirm(order);

      if (expectedMethod === 'creditCardOnline' && restaurant.asaasApiKey) {
        await this.resolveAsaasChargeIdAfterCheckoutPaid(restaurant.asaasApiKey, order.id);
      }

      res.json(200, { ...updatedOrder, payment: this.toPaymentSummary(updatedPayment) });
    });
  }
}
