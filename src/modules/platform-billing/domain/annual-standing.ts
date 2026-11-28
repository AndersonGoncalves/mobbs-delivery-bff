import type { BillingTier } from '../../billing/domain/billing';
import type { ISubscriptionObligation } from './entities/subscription-obligation.entity';

/**
 * specs/0175 T053 (achado na homologação, 28/11/2026) — situação anual do restaurante a partir das
 * faturas, pra visão da plataforma:
 * - `active`: tem ano anual PAGO em vigor (inclusive com a renovação cancelada, REQ-37);
 * - `awaiting_payment`: contratou (adesão ou renovação) mas a fatura anual ainda não foi paga;
 * - `null`: não está no anual.
 * Antes a lista usava só "assinatura com renovação ativa": mostrava "Anual" pra quem não pagou e
 * "Mensal" pra quem pagou e cancelou a renovação.
 */
export type AnnualStanding = { status: 'active'; tier: BillingTier; coverageEnd: Date } | { status: 'awaiting_payment'; tier: BillingTier };

const ANNUAL_KINDS = new Set(['annual-initial', 'annual-renewal']);
const AWAITING_PAYMENT_STATUSES = new Set(['awaiting_issue', 'issue_failed', 'pending', 'overdue']);

export function annualStandingOf(obligations: ISubscriptionObligation[], now: Date): AnnualStanding | null {
  let active: { tier: BillingTier; coverageEnd: Date } | null = null;
  let awaiting: ISubscriptionObligation | null = null;
  for (const obligation of obligations) {
    if (!ANNUAL_KINDS.has(obligation.kind)) continue;
    if (obligation.status === 'paid' && obligation.coveragePeriod) {
      const end = new Date(obligation.coveragePeriod.end);
      if (end.getTime() > now.getTime() && (!active || end.getTime() > active.coverageEnd.getTime())) active = { tier: obligation.tier, coverageEnd: end };
    } else if (AWAITING_PAYMENT_STATUSES.has(obligation.status)) {
      awaiting = obligation;
    }
  }
  if (active) return { status: 'active', ...active };
  if (awaiting) return { status: 'awaiting_payment', tier: awaiting.tier };
  return null;
}
