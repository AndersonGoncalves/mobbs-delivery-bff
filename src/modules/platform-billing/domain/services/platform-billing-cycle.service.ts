import { defaultBilling, monthKeyOf, monthRange } from '../../../billing/domain/billing';
import type { IRestaurant, IRestaurantBilling } from '../../../restaurants/domain/entities/restaurant.entity';
import { monthsBetween } from '../billing-calendar';
import type { IPixAvailabilityException } from '../entities/pix-availability-exception.entity';
import { recomputeAccessStatus } from '../recompute-access-status';
import type { IAnnualSubscriptionRepository } from '../repositories/annual-subscription.repository.interface';
import type { IPixAvailabilityExceptionRepository } from '../repositories/pix-availability-exception.repository.interface';
import type { IPlatformBillingActivationRepository } from '../repositories/platform-billing-activation.repository.interface';
import type { ISubscriptionObligationRepository } from '../repositories/subscription-obligation.repository.interface';
import { AnnualSubscriptionService } from './annual-subscription.service';
import { CloseMonthlyBillingService } from './close-monthly-billing.service';
import { ObligationIssuanceService } from './obligation-issuance.service';
import { ReconciliationService } from './reconciliation.service';

export interface PlatformBillingCycleRestaurantRepository {
  listAll(): Promise<IRestaurant[]>;
  findById(id: string): Promise<IRestaurant | null>;
  updateBilling(id: string, billing: IRestaurantBilling): Promise<IRestaurant>;
}

/**
 * specs/0175-cobranca-assinatura-asaas REQ-9/REQ-21 — orquestra, por restaurante, um ciclo
 * completo: fecha competências mensais elegíveis (nunca retroativo antes da ativação, REQ-34;
 * nunca meses já cobertos por anual, REQ-14), emite renovação anual se devida, emite Pix
 * pendentes, reconcilia pendências e recalcula `Restaurant.billing.status/cycle` pra cada
 * restaurante tocado. Chamado uma vez no boot do BFF e sob demanda via endpoint administrativo
 * (REQ-22/REQ-32) — idempotente/seguro pra rodar mais de uma vez (REQ-9/REQ-10/AC-5/AC-6).
 */
export class PlatformBillingCycleService {
  constructor(
    private readonly deps: {
      restaurantRepository: PlatformBillingCycleRestaurantRepository;
      obligationRepository: ISubscriptionObligationRepository;
      annualSubscriptionRepository: IAnnualSubscriptionRepository;
      pixAvailabilityExceptionRepository: IPixAvailabilityExceptionRepository;
      platformBillingActivationRepository: IPlatformBillingActivationRepository;
      closeMonthlyBillingService: CloseMonthlyBillingService;
      annualSubscriptionService: AnnualSubscriptionService;
      obligationIssuanceService: ObligationIssuanceService;
      reconciliationService: ReconciliationService;
    },
  ) {}

  async runCycle(now: Date): Promise<void> {
    const activation = await this.deps.platformBillingActivationRepository.get();
    if (!activation) return; // migração de ativação (T028) ainda não rodou — nada a fazer.

    const restaurants = await this.deps.restaurantRepository.listAll();
    const currentMonth = monthKeyOf(now);
    const closedMonths = monthsBetween(activation.activatedMonth, currentMonth);

    for (const restaurant of restaurants) {
      await this.closeEligibleMonths(restaurant.id, closedMonths);
      await this.issueAnnualRenewalIfDue(restaurant.id, now);
    }

    await this.deps.obligationIssuanceService.issuePending(now);
    await this.deps.reconciliationService.reconcile(now);

    for (const restaurant of restaurants) {
      await this.recomputeAndPersist(restaurant.id, now);
    }
  }

  /** REQ-14/REQ-17 — nunca fecha um mês (nem em parte) já coberto pela anual: meses cobertos
   * por inteiro não geram nada (já pagos pela anual); meses em que a anual TERMINA fecham só o
   * trecho restante (depois do fim da cobertura); meses em que a anual COMEÇA já foram fechados
   * de forma síncrona na própria adesão (`AnnualSubscriptionService.subscribe`), nada a repetir. */
  private async closeEligibleMonths(restaurantId: string, months: string[]): Promise<void> {
    const obligations = await this.deps.obligationRepository.findByRestaurantId(restaurantId);
    const annualObligations = obligations.filter(
      (obligation) => (obligation.kind === 'annual-initial' || obligation.kind === 'annual-renewal') && obligation.status !== 'cancelled',
    );

    for (const month of months) {
      const { start, end } = monthRange(month);
      const overlapping = annualObligations.filter(
        (obligation) => obligation.coveragePeriod && obligation.coveragePeriod.start.getTime() < end.getTime() && obligation.coveragePeriod.end.getTime() > start.getTime(),
      );

      if (overlapping.length === 0) {
        await this.deps.closeMonthlyBillingService.closeMonth(restaurantId, month);
        continue;
      }

      for (const annual of overlapping) {
        const coverageEnd = annual.coveragePeriod!.end;
        const coverageEndsWithinMonth = coverageEnd.getTime() > start.getTime() && coverageEnd.getTime() < end.getTime();
        if (coverageEndsWithinMonth) {
          await this.deps.closeMonthlyBillingService.closeProratedMonthlySegment(restaurantId, month, coverageEnd, end);
        }
        // Cobertura iniciando neste mês: já fechada sincronamente na adesão (nada a fazer aqui).
        // Cobertura cobrindo o mês inteiro: nada a fazer (já pago pela anual).
      }
    }
  }

  private async issueAnnualRenewalIfDue(restaurantId: string, now: Date): Promise<void> {
    const subscription = await this.deps.annualSubscriptionRepository.findActiveByRestaurantId(restaurantId);
    if (!subscription) return;
    await this.deps.annualSubscriptionService.issueRenewalIfDue(subscription, now);
  }

  private async recomputeAndPersist(restaurantId: string, now: Date): Promise<void> {
    const restaurant = await this.deps.restaurantRepository.findById(restaurantId);
    if (!restaurant) return;

    const openObligations = await this.deps.obligationRepository.findOpenByRestaurantId(restaurantId);
    const exceptions: IPixAvailabilityException[] = [];
    for (const obligation of openObligations) {
      const exception = await this.deps.pixAvailabilityExceptionRepository.findByObligationId(obligation.id);
      if (exception) exceptions.push(exception);
    }

    const { status, cycle } = recomputeAccessStatus(openObligations, exceptions, now);
    const currentBilling = restaurant.billing ?? defaultBilling(monthKeyOf(now));
    await this.deps.restaurantRepository.updateBilling(restaurantId, { ...currentBilling, status, cycle });
  }
}
