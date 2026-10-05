import {
  buildUpgradeMessage,
  computeBillingTier,
  isBillingBlocked,
  monthKeyOf,
  monthRange,
  priceCents,
  sumRevenueCents,
} from './billing';

describe('computeBillingTier (specs/0042 REQ-1/REQ-2)', () => {
  it('AC-2: passar de R$ 2.000,00 sobe pra Pro; até o limite continua gratuito', () => {
    expect(computeBillingTier(200000)).toBe('free');
    expect(computeBillingTier(200001)).toBe('pro');
  });

  it('acima de R$ 8.000,00 vira Premium', () => {
    expect(computeBillingTier(800000)).toBe('pro');
    expect(computeBillingTier(800001)).toBe('premium');
  });
});

describe('sumRevenueCents (AC-1)', () => {
  it('soma só o que recebe, em centavos (os pedidos entregues de R$ 700 cada dão R$ 2.100)', () => {
    expect(sumRevenueCents([{ total: 700 }, { total: 700 }, { total: 700 }])).toBe(210000);
  });
});

describe('isBillingBlocked (REQ-7/REQ-8)', () => {
  it('AC-8: restaurante no gratuito nunca fica bloqueado, mesmo com status blocked marcado por engano', () => {
    expect(isBillingBlocked({ referenceMonth: '2026-10', currentTier: 'free', notified75Percent: false, notifiedTierUpgrade: false, status: 'blocked', cycle: 'monthly' })).toBe(false);
  });

  it('restaurante em faixa paga com status blocked fica bloqueado; com status ok, não', () => {
    const base = { referenceMonth: '2026-10', currentTier: 'pro' as const, notified75Percent: false, notifiedTierUpgrade: false, cycle: 'monthly' as const };
    expect(isBillingBlocked({ ...base, status: 'blocked' })).toBe(true);
    expect(isBillingBlocked({ ...base, status: 'ok' })).toBe(false);
    expect(isBillingBlocked(undefined)).toBe(false);
  });
});

describe('mês de referência em Brasília (UTC-3)', () => {
  it('2026-10-01 02:00 UTC ainda é setembro em Brasília', () => {
    expect(monthKeyOf(new Date('2026-10-01T02:00:00Z'))).toBe('2026-09');
    expect(monthKeyOf(new Date('2026-10-01T04:00:00Z'))).toBe('2026-10');
  });

  it('o intervalo do mês começa às 03:00 UTC (meia-noite de Brasília)', () => {
    const { start, end } = monthRange('2026-10');
    expect(start.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });
});

describe('preços por ciclo (REQ-9)', () => {
  it('anual é 10× a mensal (2 meses grátis)', () => {
    expect(priceCents('pro', 'monthly')).toBe(6990);
    expect(priceCents('pro', 'annual')).toBe(69900);
    expect(priceCents('premium', 'annual')).toBe(119900);
  });

  it('AC-4: o comemorativo informa a mensalidade do plano novo', () => {
    expect(buildUpgradeMessage('pro')).toContain('R$ 69,90/mês');
  });
});
