import { DEFAULT_BILLING_SETTINGS } from '../../../billing/domain/billing';
import { addCalendarYear, localMidnight } from '../billing-calendar';
import type { IAnnualSubscription } from '../entities/annual-subscription.entity';
import type { ISubscriptionObligation } from '../entities/subscription-obligation.entity';
import { AnnualAdhesionAlreadyActiveError, AnnualSubscriptionService } from './annual-subscription.service';
import { CloseMonthlyBillingService } from './close-monthly-billing.service';

function buildSubscription(overrides: Partial<IAnnualSubscription> = {}): IAnnualSubscription {
  return { id: 'sub-1', restaurantId: 'r-1', joinedAt: localMidnight(new Date('2026-10-24T12:00:00Z')), renewalActive: true, createdAt: new Date(), updatedAt: new Date(), ...overrides };
}

function buildObligation(overrides: Partial<ISubscriptionObligation> = {}): ISubscriptionObligation {
  return {
    id: 'ob-1', restaurantId: 'r-1', kind: 'annual-initial', tier: 'pro', settingsVersionId: 'v1', amountCents: 79900,
    status: 'awaiting_issue', dueDate: new Date(), createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

function setup(options: { orders?: { total: number }[] } = {}) {
  const annualSubscriptionRepository = {
    findActiveByRestaurantId: jest.fn().mockResolvedValue(null),
    findByRestaurantId: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockImplementation(async (restaurantId, joinedAt) => buildSubscription({ restaurantId, joinedAt })),
    cancelRenewal: jest.fn().mockImplementation(async (id, cancelledAt, cancelledBy) => buildSubscription({ id, renewalActive: false, cancelledAt, cancelledBy })),
  };
  const obligationRepository = {
    upsertAnnual: jest.fn().mockImplementation(async (input) => buildObligation({ ...input, status: 'awaiting_issue' })),
    findByRestaurantId: jest.fn().mockResolvedValue([]),
    markCancelled: jest.fn().mockImplementation(async (id) => buildObligation({ id, status: 'cancelled' })),
  };
  const orderRepository = { findDeliveredByRestaurantBetween: jest.fn().mockResolvedValue(options.orders ?? []) };
  const settingsVersionRepository = {
    currentAt: jest.fn().mockResolvedValue({ id: 'v1', ...DEFAULT_BILLING_SETTINGS, effectiveFrom: new Date('2026-01-01T00:00:00Z'), createdBy: 'system', createdAt: new Date() }),
  };
  const closeMonthlyBillingService = new CloseMonthlyBillingService({ orderRepository, obligationRepository, settingsVersionRepository } as never);
  jest.spyOn(closeMonthlyBillingService, 'closeProratedMonthlySegment').mockResolvedValue(buildObligation({ kind: 'monthly-prorated' }));
  const service = new AnnualSubscriptionService({ annualSubscriptionRepository, obligationRepository, closeMonthlyBillingService } as never);
  return { service, annualSubscriptionRepository, obligationRepository, closeMonthlyBillingService };
}

describe('AnnualSubscriptionService.subscribe (AC-7)', () => {
  it('AC-7: Pro com configuração padrão aderindo em 24/10/2026 oferece R$ 799,00 até 23/10/2027, Pix vencendo 03/11/2026', async () => {
    const { service, obligationRepository } = setup({ orders: [{ total: 3000 }] }); // Pro pela receita do mês até a adesão
    const now = new Date('2026-10-24T15:00:00Z');

    const { obligation } = await service.subscribe('r-1', now);

    expect(obligationRepository.upsertAnnual).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'annual-initial',
        tier: 'pro',
        amountCents: 79900,
        coveragePeriod: { start: localMidnight(now), end: addCalendarYear(localMidnight(now)) },
      }),
    );
    expect(obligation.amountCents).toBe(79900);
  });

  it('AC-7: faixa Gratuito aplica piso Pro (anual nunca é grátis)', async () => {
    const { service, obligationRepository } = setup({ orders: [{ total: 0 }] });

    await service.subscribe('r-1', new Date('2026-10-24T15:00:00Z'));

    expect(obligationRepository.upsertAnnual).toHaveBeenCalledWith(expect.objectContaining({ tier: 'pro', amountCents: 79900 }));
  });

  it('REQ-13: impede adesão duplicada quando já existe assinatura ativa', async () => {
    const { service, annualSubscriptionRepository } = setup();
    annualSubscriptionRepository.findActiveByRestaurantId.mockResolvedValue(buildSubscription());

    await expect(service.subscribe('r-1', new Date())).rejects.toThrow(AnnualAdhesionAlreadyActiveError);
  });

  it('AC-13: fecha o trecho mensal restante do mês de adesão (01 a 23/10)', async () => {
    const { service, closeMonthlyBillingService } = setup({ orders: [{ total: 3000 }] });
    const now = new Date('2026-10-24T15:00:00Z');

    await service.subscribe('r-1', now);

    expect(closeMonthlyBillingService.closeProratedMonthlySegment).toHaveBeenCalledWith(
      'r-1', '2026-10', new Date('2026-10-01T03:00:00.000Z'), localMidnight(now),
    );
  });

  it('adesão no dia 1 do mês não fecha trecho mensal nenhum (0 dias sob mensal)', async () => {
    const { service, closeMonthlyBillingService } = setup();

    await service.subscribe('r-1', new Date('2026-11-01T06:00:00Z'));

    expect(closeMonthlyBillingService.closeProratedMonthlySegment).not.toHaveBeenCalled();
  });
});

describe('AnnualSubscriptionService.issueRenewalIfDue (AC-9/AC-10)', () => {
  it('AC-9: adesão 24/10/2026 com renovação ativa gera a renovação em 24/10/2027, vencendo 03/11/2027', async () => {
    const { service, obligationRepository } = setup({ orders: [{ total: 3000 }] });
    const initial = buildObligation({ kind: 'annual-initial', coveragePeriod: { start: localMidnight(new Date('2026-10-24T12:00:00Z')), end: localMidnight(new Date('2027-10-24T12:00:00Z')) } });
    obligationRepository.findByRestaurantId.mockResolvedValue([initial]);
    const subscription = buildSubscription();

    const renewal = await service.issueRenewalIfDue(subscription, new Date('2027-10-24T15:00:00Z'));

    expect(renewal).not.toBeNull();
    expect(obligationRepository.upsertAnnual).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'annual-renewal',
        coveragePeriod: { start: localMidnight(new Date('2027-10-24T12:00:00Z')), end: addCalendarYear(localMidnight(new Date('2027-10-24T12:00:00Z'))) },
        dueDate: new Date('2027-11-03T03:00:00.000Z'),
      }),
    );
  });

  it('antes do aniversário, não gera renovação nenhuma', async () => {
    const { service, obligationRepository } = setup();
    const initial = buildObligation({ kind: 'annual-initial', coveragePeriod: { start: localMidnight(new Date('2026-10-24T12:00:00Z')), end: localMidnight(new Date('2027-10-24T12:00:00Z')) } });
    obligationRepository.findByRestaurantId.mockResolvedValue([initial]);

    const renewal = await service.issueRenewalIfDue(buildSubscription(), new Date('2027-10-20T15:00:00Z'));

    expect(renewal).toBeNull();
  });

  it('renewalActive false (cancelado) nunca gera renovação', async () => {
    const { service } = setup();
    const renewal = await service.issueRenewalIfDue(buildSubscription({ renewalActive: false }), new Date('2027-10-24T15:00:00Z'));
    expect(renewal).toBeNull();
  });

  it('REQ-15: usa a faixa do ÚLTIMO MÊS COMPLETO anterior ao aniversário (setembro, não outubro em curso)', async () => {
    const { service, obligationRepository, closeMonthlyBillingService } = setup({ orders: [{ total: 3000 }] });
    const initial = buildObligation({ kind: 'annual-initial', coveragePeriod: { start: localMidnight(new Date('2026-10-24T12:00:00Z')), end: localMidnight(new Date('2027-10-24T12:00:00Z')) } });
    obligationRepository.findByRestaurantId.mockResolvedValue([initial]);
    const evaluateSpy = jest.spyOn(closeMonthlyBillingService, 'evaluateRevenueTier');

    await service.issueRenewalIfDue(buildSubscription(), new Date('2027-10-25T15:00:00Z'));

    expect(evaluateSpy).toHaveBeenCalledWith('r-1', new Date('2027-09-01T03:00:00.000Z'), new Date('2027-10-01T03:00:00.000Z'), localMidnight(new Date('2027-10-24T12:00:00Z')));
  });

  it('idempotente — upsertAnnual garante que chamar de novo não duplica (mesmo coveragePeriod.start)', async () => {
    const { service, obligationRepository } = setup({ orders: [{ total: 3000 }] });
    const initial = buildObligation({ kind: 'annual-initial', coveragePeriod: { start: localMidnight(new Date('2026-10-24T12:00:00Z')), end: localMidnight(new Date('2027-10-24T12:00:00Z')) } });
    obligationRepository.findByRestaurantId.mockResolvedValue([initial]);

    await service.issueRenewalIfDue(buildSubscription(), new Date('2027-10-24T15:00:00Z'));
    await service.issueRenewalIfDue(buildSubscription(), new Date('2027-10-24T15:00:00Z'));

    expect(obligationRepository.upsertAnnual).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = obligationRepository.upsertAnnual.mock.calls;
    expect(firstCall[0].coveragePeriod.start).toEqual(secondCall[0].coveragePeriod.start);
  });
});

describe('AnnualSubscriptionService.cancelRenewal (AC-11)', () => {
  it('AC-11: cancela só a renovação, sem tocar na obligation já paga', async () => {
    const { service, annualSubscriptionRepository } = setup();
    const subscription = buildSubscription();

    await service.cancelRenewal(subscription, new Date('2027-01-01T00:00:00Z'), 'dono@primepizza.com');

    expect(annualSubscriptionRepository.cancelRenewal).toHaveBeenCalledWith('sub-1', new Date('2027-01-01T00:00:00Z'), 'dono@primepizza.com');
  });
});

describe('AnnualSubscriptionService.withdrawUnpaidAnnual (AC-12)', () => {
  it('AC-12: cancela a obligation ainda não paga e desliga a renovação', async () => {
    const { service, obligationRepository, annualSubscriptionRepository } = setup();
    const subscription = buildSubscription();
    const obligation = buildObligation({ status: 'awaiting_issue' });

    await service.withdrawUnpaidAnnual(subscription, obligation, new Date('2026-10-25T00:00:00Z'), 'dono@primepizza.com');

    expect(obligationRepository.markCancelled).toHaveBeenCalledWith('ob-1');
    expect(annualSubscriptionRepository.cancelRenewal).toHaveBeenCalledWith('sub-1', new Date('2026-10-25T00:00:00Z'), 'dono@primepizza.com');
  });
});
