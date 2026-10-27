import type { BillingTier } from '../../../billing/domain/billing';

export type SubscriptionObligationKind = 'monthly' | 'monthly-prorated' | 'annual-initial' | 'annual-renewal';

/**
 * specs/0175-cobranca-assinatura-asaas REQ-6/REQ-7/REQ-13/REQ-15/REQ-17 — a unidade cobrável,
 * substituindo `Restaurant.billing.status` como fonte de verdade manual: `status` deixa de ser
 * escrito à mão (`scripts/set-billing-status.ts`) e passa a ser DERIVADO da totalidade das
 * obligations reais + `IPixAvailabilityException` (`recomputeAccessStatus`).
 *
 * `exempt`: competência fechada na faixa Gratuita, `amountCents: 0`, nunca gera cobrança Asaas.
 * `awaiting_issue`: criada pelo fechamento/adesão, aguardando a emissão real no Asaas.
 * `issue_failed`: emissão tentada e falhou (rede/API) — retentada pelo próximo ciclo (REQ-12).
 * `pending`: cobrança criada no Asaas, aguardando pagamento.
 * `paid`: confirmada (webhook ou reconciliação).
 * `overdue`: vencida sem pagamento (REQ-24) — dispara bloqueio, respeitando a exceção de 3 dias.
 * `cancelled`: cobrança cancelada antes de ser paga (ex. desistência de anual não pago, REQ-16).
 * `refunded`/`partially_refunded`: ver REQ-23 — nunca produz falsa quitação.
 */
export type SubscriptionObligationStatus =
  | 'exempt'
  | 'awaiting_issue'
  | 'issue_failed'
  | 'pending'
  | 'paid'
  | 'overdue'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

export interface ISubscriptionObligation {
  id: string;
  restaurantId: string;
  kind: SubscriptionObligationKind;
  /** Só `kind === 'monthly' | 'monthly-prorated'` — `YYYY-MM` da competência fechada. */
  referenceMonth?: string;
  /** Só `kind === 'annual-initial' | 'annual-renewal'` — cobertura congelada na emissão. */
  coveragePeriod?: { start: Date; end: Date };

  // Congelados no fechamento/adesão — REQ-7/REQ-8/AC-4: nunca recalculados por reajuste posterior.
  tier: BillingTier;
  settingsVersionId: string;
  /** Faturamento usado pra determinar `tier` (auditoria, REQ-6 "registrar o resultado auditável"). */
  revenueCentsUsed?: number;
  amountCents: number;
  /** Só `kind === 'monthly-prorated'` — dias sob mensal / dias do mês (auditoria do AC-13). */
  roundingDetail?: { daysUnderMonthly: number; daysInMonth: number };

  status: SubscriptionObligationStatus;
  dueDate: Date;
  issuedAt?: Date;
  paidAt?: Date;
  /** Motivo da última falha de emissão (`issue_failed`) — pendência acionável, REQ-12. */
  issueFailureReason?: string;

  // Preenchidos quando a cobrança existe de verdade no Asaas.
  /** Id do PAGAMENTO no Asaas — nunca de checkout/preferência (não existe aqui, é sempre Pix direto). */
  asaasChargeId?: string;
  pixPayload?: string;
  pixExpiresAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}
