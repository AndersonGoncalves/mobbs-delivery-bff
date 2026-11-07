import type { ISubscriptionObligation } from '../../../platform-billing/domain/entities/subscription-obligation.entity';
import type { IObligationPaymentObserver } from '../../../platform-billing/domain/services/i-obligation-payment-observer.interface';
import type { ResellerCommissionService } from '../../domain/services/reseller-commission.service';

/**
 * specs/0205-comissao-revendedor plan.md — adapter que implementa a interface de
 * `platform-billing` delegando pra lógica real em `resellers` (`ResellerCommissionService`). É o
 * único arquivo de `resellers` que `main.ts` passa pro construtor de
 * `PlatformBillingWebhookController`/`ReconciliationService` — eles só conhecem a interface.
 */
export class ResellerCommissionObligationObserver implements IObligationPaymentObserver {
  constructor(private readonly service: ResellerCommissionService) {}

  onObligationPaid(obligation: ISubscriptionObligation): Promise<void> {
    return this.service.onObligationPaid(obligation);
  }

  onObligationRefunded(obligation: ISubscriptionObligation): Promise<void> {
    return this.service.onObligationRefunded(obligation);
  }
}
