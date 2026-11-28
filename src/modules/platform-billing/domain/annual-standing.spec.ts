import type { ISubscriptionObligation } from './entities/subscription-obligation.entity';
import { annualStandingOf } from './annual-standing';

function obligation(overrides: Partial<ISubscriptionObligation>): ISubscriptionObligation {
  return {
    id: 'ob-1', restaurantId: 'r-1', kind: 'annual-initial', tier: 'pro', settingsVersionId: 'v1', amountCents: 79900,
    status: 'paid', dueDate: new Date(), createdAt: new Date(), updatedAt: new Date(),
    coveragePeriod: { start: new Date('2026-11-27T03:00:00Z'), end: new Date('2027-11-27T03:00:00Z') }, ...overrides,
  };
}

describe('annualStandingOf (specs/0175 T053)', () => {
  const now = new Date('2026-11-28T15:00:00Z');

  it('ano pago em vigor → active, com a faixa e o fim da cobertura', () => {
    expect(annualStandingOf([obligation({})], now)).toEqual({ status: 'active', tier: 'pro', coverageEnd: new Date('2027-11-27T03:00:00Z') });
  });

  it('ano pago e renovação ainda não paga → continua active (o ano pago vale)', () => {
    expect(annualStandingOf([obligation({}), obligation({ id: 'ob-2', kind: 'annual-renewal', status: 'pending', coveragePeriod: undefined })], now)?.status).toBe('active');
  });

  it.each(['awaiting_issue', 'issue_failed', 'pending', 'overdue'] as const)('anual "%s" sem ano pago → awaiting_payment', (status) => {
    expect(annualStandingOf([obligation({ status })], now)).toEqual({ status: 'awaiting_payment', tier: 'pro' });
  });

  it('ano pago já vencido, anual cancelado ou só faturas mensais → null', () => {
    expect(annualStandingOf([obligation({})], new Date('2027-12-01T12:00:00Z'))).toBeNull();
    expect(annualStandingOf([obligation({ status: 'cancelled' })], now)).toBeNull();
    expect(annualStandingOf([obligation({ kind: 'monthly', status: 'pending' })], now)).toBeNull();
  });

  it('T058: ano estornado parcialmente continua active', () => {
    expect(annualStandingOf([obligation({ status: 'partially_refunded' })], now)?.status).toBe('active');
  });
});
