import { DEFAULT_BILLING_SETTINGS } from '../../../billing/domain/billing';
import type { IBillingSettingsVersion } from '../entities/billing-settings-version.entity';
import { CloseMonthlyBillingService } from './close-monthly-billing.service';

function buildSettingsVersion(overrides: Partial<IBillingSettingsVersion> = {}): IBillingSettingsVersion {
  return { id: 'v1', ...DEFAULT_BILLING_SETTINGS, effectiveFrom: new Date('2026-10-01T00:00:00Z'), createdBy: 'system', createdAt: new Date(), ...overrides };
}

function setup(options: { orders: { total: number }[]; settingsVersion?: IBillingSettingsVersion | null }) {
  const orderRepository = { findDeliveredByRestaurantBetween: jest.fn().mockResolvedValue(options.orders) };
  const obligationRepository = {
    upsertMonthly: jest.fn().mockImplementation(async (input) => ({ id: 'ob-1', restaurantId: input.restaurantId, createdAt: new Date(), updatedAt: new Date(), ...input })),
  };
  const settingsVersionRepository = { currentAt: jest.fn().mockResolvedValue('settingsVersion' in options ? options.settingsVersion : buildSettingsVersion()) };
  const service = new CloseMonthlyBillingService({ orderRepository, obligationRepository, settingsVersionRepository } as never);
  return { service, orderRepository, obligationRepository, settingsVersionRepository };
}

describe('CloseMonthlyBillingService.closeMonth (AC-3)', () => {
  it('receita até R$ 2.000,00 fecha isenta, sem Pix (status exempt, amountCents 0)', async () => {
    const { service, obligationRepository } = setup({ orders: [{ total: 2000 }] });

    await service.closeMonth('r-1', '2026-10');

    expect(obligationRepository.upsertMonthly).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'free', amountCents: 0, status: 'exempt', referenceMonth: '2026-10' }),
    );
  });

  it('R$ 2.000,01 vira Pro — R$ 79,90 referente a outubro, vencendo 10/11', async () => {
    const { service, obligationRepository } = setup({ orders: [{ total: 2000.01 }] });

    const obligation = await service.closeMonth('r-1', '2026-10');

    expect(obligationRepository.upsertMonthly).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'pro', amountCents: 7990, status: 'awaiting_issue' }),
    );
    expect(obligation.dueDate.toISOString()).toBe('2026-11-10T03:00:00.000Z');
  });

  it('acima de R$ 7.000,00 vira Premium', async () => {
    const { service, obligationRepository } = setup({ orders: [{ total: 7000.01 }] });

    await service.closeMonth('r-1', '2026-10');

    expect(obligationRepository.upsertMonthly).toHaveBeenCalledWith(expect.objectContaining({ tier: 'premium', amountCents: 11990 }));
  });

  it('dezembro vence em janeiro do ano seguinte', async () => {
    const { service, obligationRepository } = setup({ orders: [{ total: 7000.01 }] });

    await service.closeMonth('r-1', '2026-12');

    expect(obligationRepository.upsertMonthly).toHaveBeenCalledWith(expect.objectContaining({ dueDate: new Date('2027-01-10T03:00:00.000Z') }));
  });

  it('AC-4: usa a configuração vigente no FIM da competência, nunca a mais recente', async () => {
    const oldVersion = buildSettingsVersion({ id: 'v-old', proMonthlyPriceCents: 5000 });
    const { service, obligationRepository, settingsVersionRepository } = setup({ orders: [{ total: 3000 }], settingsVersion: oldVersion });

    await service.closeMonth('r-1', '2026-10');

    // `currentAt` é chamado com o FIM da competência (monthRange('2026-10').end), não "agora".
    expect(settingsVersionRepository.currentAt).toHaveBeenCalledWith(new Date('2026-11-01T03:00:00.000Z'));
    expect(obligationRepository.upsertMonthly).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 5000, settingsVersionId: 'v-old' }));
  });

  it('sem nenhuma versão de configuração vigente, lança erro explícito (migração não rodou)', async () => {
    const { service } = setup({ orders: [], settingsVersion: null });

    await expect(service.closeMonth('r-1', '2026-10')).rejects.toThrow(/migração de ativação/);
  });
});

describe('CloseMonthlyBillingService.closeProratedMonthlySegment (AC-13)', () => {
  it('trecho de 01 a 23/10 (23 dias) com faixa Pro no trecho: R$ 79,90 × 23/31 = R$ 59,28', async () => {
    const { service, obligationRepository, orderRepository } = setup({ orders: [{ total: 3000 }] });
    const segmentStart = new Date('2026-10-01T03:00:00.000Z');
    const segmentEndExclusive = new Date('2026-10-24T03:00:00.000Z');

    await service.closeProratedMonthlySegment('r-1', '2026-10', segmentStart, segmentEndExclusive);

    expect(orderRepository.findDeliveredByRestaurantBetween).toHaveBeenCalledWith('r-1', segmentStart, segmentEndExclusive);
    expect(obligationRepository.upsertMonthly).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'monthly-prorated',
        tier: 'pro',
        amountCents: 5928,
        roundingDetail: { daysUnderMonthly: 23, daysInMonth: 31 },
      }),
    );
  });

  it('trecho isento (receita baixa) fecha sem Pix', async () => {
    const { service, obligationRepository } = setup({ orders: [{ total: 100 }] });

    await service.closeProratedMonthlySegment('r-1', '2026-10', new Date('2026-10-01T03:00:00.000Z'), new Date('2026-10-24T03:00:00.000Z'));

    expect(obligationRepository.upsertMonthly).toHaveBeenCalledWith(expect.objectContaining({ status: 'exempt', amountCents: 0 }));
  });
});
