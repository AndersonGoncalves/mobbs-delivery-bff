import type { ISubscriptionObligation } from '../entities/subscription-obligation.entity';
import type { ISubscriptionEventRepository } from '../repositories/subscription-event.repository.interface';
import type { ISubscriptionObligationRepository } from '../repositories/subscription-obligation.repository.interface';

/** Só o método de `AsaasClient` que a reconciliação precisa — consulta por id direto (a
 * obligation já tem `asaasChargeId` persistido, diferente da emissão, que ainda não sabe o id). */
export interface PlatformAsaasPaymentClient {
  getPayment(chargeId: string): Promise<{ id: string; status: string }>;
}

// Valores reais do campo `status` de um pagamento Asaas (verificado em
// docs.asaas.com/reference/recuperar-uma-unica-cobranca, 2026-10-27) — nunca assumidos.
const PAID_STATUSES = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);

/**
 * specs/0175-cobranca-assinatura-asaas REQ-22/REQ-23 — nunca declara quitação com base em
 * comprovante/botão/estado local: sempre confirma com o provedor antes de marcar `paid`. Cobre
 * webhook perdido/atrasado (AC-16) e representa estorno total/parcial sem falsa quitação
 * (AC-17) — estorno parcial nunca é auto-resolvido (REQ-23), só logado como pendência.
 */
export class ReconciliationService {
  constructor(
    private readonly deps: {
      obligationRepository: ISubscriptionObligationRepository;
      subscriptionEventRepository: ISubscriptionEventRepository;
      asaasClient: PlatformAsaasPaymentClient;
    },
  ) {}

  /** Sem filtro: todas as `pending`/`overdue`. Com `restaurantId`: só as daquele restaurante
   * (reprocessamento administrativo de uma loja, REQ-32). Com `obligationId`: uma específica
   * (botão "Verificar pagamento" do lojista, REQ-22 "quando um operador solicitar"). */
  async reconcile(now: Date, filter: { restaurantId?: string; obligationId?: string } = {}): Promise<void> {
    if (filter.obligationId) {
      const obligation = await this.deps.obligationRepository.findById(filter.obligationId);
      if (obligation) await this.reconcileOne(obligation, now);
      return;
    }
    const pending = await this.deps.obligationRepository.findPendingForReconciliation(filter.restaurantId);
    for (const obligation of pending) {
      await this.reconcileOne(obligation, now);
    }
  }

  private async reconcileOne(obligation: ISubscriptionObligation, now: Date): Promise<void> {
    // Nunca foi emitida de verdade (sem chargeId) — nada a reconciliar ainda, cabe à emissão.
    if (!obligation.asaasChargeId) return;

    const payment = await this.deps.asaasClient.getPayment(obligation.asaasChargeId);
    await this.deps.subscriptionEventRepository.append({
      obligationId: obligation.id,
      type: 'reconciled',
      payload: { status: payment.status },
      actor: 'system',
    });

    if (PAID_STATUSES.has(payment.status)) {
      if (obligation.status !== 'paid') await this.deps.obligationRepository.markPaid(obligation.id, now);
      return;
    }
    if (payment.status === 'REFUNDED') {
      // REQ-23 — estorno total reabre o saldo devido (nunca falsa quitação).
      await this.deps.obligationRepository.markRefunded(obligation.id);
      return;
    }
    if (payment.status === 'OVERDUE' && obligation.status !== 'overdue') {
      await this.deps.obligationRepository.markOverdue(obligation.id);
      return;
    }
    // `PENDING`/demais estados (ex. `REFUND_IN_PROGRESS`, chargeback) — o evento acima já ficou
    // registrado como pendência; REQ-23 é explícito que disputa/estorno parcial não são
    // auto-resolvidos, só tratamento administrativo (REQ-32).
  }
}
