import type { ISubscriptionObligation } from '../entities/subscription-obligation.entity';

/**
 * specs/0205-comissao-revendedor plan.md — inversão de dependência: `platform-billing` não
 * conhece `resellers` (mantém o bounded context independente, mesmo raciocínio de
 * `specs/0189` ao duplicar `generateReferralCode` em vez de importar de `referrals`). Esta
 * interface nasce AQUI (módulo que dispara o evento) e é implementada por quem precisa reagir a
 * pagamento/estorno de uma obligation sem que este módulo precise importar nada de lá. Injetada
 * em `PlatformBillingWebhookController`/`ReconciliationService`, chamada depois de
 * `markPaid`/`markRefunded`/`markPartiallyRefunded` nos dois.
 */
export interface IObligationPaymentObserver {
  onObligationPaid(obligation: ISubscriptionObligation): Promise<void>;
  onObligationRefunded(obligation: ISubscriptionObligation): Promise<void>;
}
