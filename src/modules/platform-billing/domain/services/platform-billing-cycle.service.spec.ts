import { localMidnight } from '../billing-calendar';
import type { ISubscriptionObligation } from '../entities/subscription-obligation.entity';
import { AnnualSubscriptionService } from './annual-subscription.service';
import { CloseMonthlyBillingService } from './close-monthly-billing.service';
import { ObligationIssuanceService } from './obligation-issuance.service';
import { PlatformBillingCycleService } from './platform-billing-cycle.service';
import { ReconciliationService } from './reconciliation.service';

function buildRestaurant(overrides: Record<string, unknown> = {}) {
  return { id: 'r-1', name: 'Prime Pizza', billing: undefined, ...overrides };
}

function buildObligation(overrides: Partial<ISubscriptionObligation> = {}): ISubscriptionObligation {
  return {
    id: 'ob-1', restaurantId: 'r-1', kind: 'monthly', referenceMonth: '2026-10', tier: 'pro', settingsVersionId: 'v1',
    amountCents: 7990, status: 'pending', dueDate: localMidnight(new Date('2026-11-10T12:00:00Z')),
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

function setup(options: { restaurants?: ReturnType<typeof buildRestaurant>[]; obligations?: ISubscriptionObligation[]; activation?: { activatedMonth: string } | null }) {
  const restaurantRepository = {
    listAll: jest.fn().mockResolvedValue(options.restaurants ?? [buildRestaurant()]),
    findById: jest.fn().mockImplementation(async (id: string) => (options.restaurants ?? [buildRestaurant()]).find((r) => r.id === id) ?? null),
    updateBilling: jest.fn().mockResolvedValue(buildRestaurant()),
  };
  const obligationRepository = {
    findByRestaurantId: jest.fn().mockResolvedValue(options.obligations ?? []),
    findOpenByRestaurantId: jest.fn().mockResolvedValue([]),
  };
  const annualSubscriptionRepository = { findActiveByRestaurantId: jest.fn().mockResolvedValue(null) };
  const pixAvailabilityExceptionRepository = { findByObligationId: jest.fn().mockResolvedValue(null) };
  const platformBillingActivationRepository = { get: jest.fn().mockResolvedValue('activation' in options ? options.activation : { activatedMonth: '2026-08' }) };

  const closeMonthlyBillingService = new CloseMonthlyBillingService({} as never);
  jest.spyOn(closeMonthlyBillingService, 'closeMonth').mockResolvedValue(buildObligation());
  jest.spyOn(closeMonthlyBillingService, 'closeProratedMonthlySegment').mockResolvedValue(buildObligation({ kind: 'monthly-prorated' }));

  const annualSubscriptionService = new AnnualSubscriptionService({} as never);
  jest.spyOn(annualSubscriptionService, 'issueRenewalIfDue').mockResolvedValue(null);

  const obligationIssuanceService = new ObligationIssuanceService({} as never);
  jest.spyOn(obligationIssuanceService, 'issuePending').mockResolvedValue(undefined);

  const reconciliationService = new ReconciliationService({} as never);
  jest.spyOn(reconciliationService, 'reconcile').mockResolvedValue(undefined);

  const service = new PlatformBillingCycleService({
    restaurantRepository, obligationRepository, annualSubscriptionRepository, pixAvailabilityExceptionRepository, platformBillingActivationRepository,
    closeMonthlyBillingService, annualSubscriptionService, obligationIssuanceService, reconciliationService,
  } as never);

  return { service, restaurantRepository, obligationRepository, annualSubscriptionRepository, platformBillingActivationRepository, closeMonthlyBillingService, annualSubscriptionService, obligationIssuanceService, reconciliationService };
}

describe('PlatformBillingCycleService.runCycle', () => {
  it('sem migração de ativação ainda, não faz nada', async () => {
    const { service, restaurantRepository } = setup({ activation: null });

    await service.runCycle(new Date('2026-11-01T12:00:00Z'));

    expect(restaurantRepository.listAll).not.toHaveBeenCalled();
  });

  it('REQ-34: nunca fecha competência anterior à ativação (fecha só desde activatedMonth até o mês corrente, exclusive)', async () => {
    const { service, closeMonthlyBillingService } = setup({ activation: { activatedMonth: '2026-08' } });

    await service.runCycle(new Date('2026-11-05T12:00:00Z'));

    expect(closeMonthlyBillingService.closeMonth).toHaveBeenCalledWith('r-1', '2026-08');
    expect(closeMonthlyBillingService.closeMonth).toHaveBeenCalledWith('r-1', '2026-09');
    expect(closeMonthlyBillingService.closeMonth).toHaveBeenCalledWith('r-1', '2026-10');
    expect(closeMonthlyBillingService.closeMonth).not.toHaveBeenCalledWith('r-1', '2026-11');
  });

  it('REQ-14: mês inteiramente coberto por anual nunca fecha como monthly normal', async () => {
    const annual = buildObligation({
      kind: 'annual-initial', status: 'paid',
      coveragePeriod: { start: localMidnight(new Date('2026-08-01T12:00:00Z')), end: localMidnight(new Date('2027-08-01T12:00:00Z')) },
    });
    const { service, closeMonthlyBillingService } = setup({ activation: { activatedMonth: '2026-08' }, obligations: [annual] });

    await service.runCycle(new Date('2026-10-05T12:00:00Z'));

    expect(closeMonthlyBillingService.closeMonth).not.toHaveBeenCalled();
    expect(closeMonthlyBillingService.closeProratedMonthlySegment).not.toHaveBeenCalled();
  });

  it('mês em que a cobertura anual TERMINA fecha só o trecho restante (proporcional, depois do fim da cobertura)', async () => {
    const annual = buildObligation({
      kind: 'annual-initial', status: 'paid',
      coveragePeriod: { start: localMidnight(new Date('2025-10-24T12:00:00Z')), end: localMidnight(new Date('2026-10-24T12:00:00Z')) },
    });
    const { service, closeMonthlyBillingService } = setup({ activation: { activatedMonth: '2026-08' }, obligations: [annual] });

    await service.runCycle(new Date('2026-11-05T12:00:00Z'));

    // Outubro/2026: cobertura termina em 24/10 — fecha só o trecho 24/10 a 01/11 (fim do mês).
    expect(closeMonthlyBillingService.closeProratedMonthlySegment).toHaveBeenCalledWith(
      'r-1', '2026-10', localMidnight(new Date('2026-10-24T12:00:00Z')), new Date('2026-11-01T03:00:00.000Z'),
    );
    // Agosto e setembro inteiros já estavam cobertos — nunca fecham normal.
    expect(closeMonthlyBillingService.closeMonth).not.toHaveBeenCalledWith('r-1', '2026-08');
    expect(closeMonthlyBillingService.closeMonth).not.toHaveBeenCalledWith('r-1', '2026-09');
  });

  it('emite renovação anual se devida, emite pendentes e reconcilia', async () => {
    const { service, annualSubscriptionRepository, annualSubscriptionService, obligationIssuanceService, reconciliationService } = setup({});
    annualSubscriptionRepository.findActiveByRestaurantId.mockResolvedValue({ id: 'sub-1', restaurantId: 'r-1', renewalActive: true });

    await service.runCycle(new Date('2026-11-05T12:00:00Z'));

    expect(annualSubscriptionService.issueRenewalIfDue).toHaveBeenCalled();
    expect(obligationIssuanceService.issuePending).toHaveBeenCalledWith(new Date('2026-11-05T12:00:00Z'));
    expect(reconciliationService.reconcile).toHaveBeenCalledWith(new Date('2026-11-05T12:00:00Z'));
  });

  it('REQ-21: recalcula e persiste status/cycle de cada restaurante ao final do ciclo', async () => {
    const { service, restaurantRepository, obligationRepository } = setup({});
    obligationRepository.findOpenByRestaurantId.mockResolvedValue([buildObligation({ status: 'overdue', dueDate: localMidnight(new Date('2026-09-10T12:00:00Z')) })]);

    await service.runCycle(new Date('2026-11-05T12:00:00Z'));

    expect(restaurantRepository.updateBilling).toHaveBeenCalledWith('r-1', expect.objectContaining({ status: 'blocked' }));
  });
});
