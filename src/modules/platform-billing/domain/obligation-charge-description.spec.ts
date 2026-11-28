import type { ISubscriptionObligation } from './entities/subscription-obligation.entity';
import { obligationChargeDescription } from './obligation-charge-description';

function obligation(overrides: Partial<ISubscriptionObligation>): ISubscriptionObligation {
  return {
    id: 'ob-1',
    restaurantId: 'r-1',
    kind: 'monthly',
    tier: 'pro',
    settingsVersionId: 'v1',
    amountCents: 7990,
    status: 'awaiting_issue',
    dueDate: new Date('2026-12-10T03:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ISubscriptionObligation;
}

describe('obligationChargeDescription (specs/0175 T059)', () => {
  it('mensal e proporcional trazem a competência', () => {
    expect(obligationChargeDescription(obligation({ kind: 'monthly', referenceMonth: '2026-11' }))).toBe('BsDelivery — mensalidade de 11/2026');
    expect(obligationChargeDescription(obligation({ kind: 'monthly-prorated', referenceMonth: '2026-11' }))).toBe('BsDelivery — mensalidade proporcional de 11/2026');
  });

  it('anual traz o período de cobertura no fuso de São Paulo', () => {
    const coveragePeriod = { start: new Date('2026-11-28T03:00:00Z'), end: new Date('2027-11-28T03:00:00Z') };
    expect(obligationChargeDescription(obligation({ kind: 'annual-initial', coveragePeriod }))).toBe('BsDelivery — assinatura anual (28/11/2026 a 28/11/2027)');
    expect(obligationChargeDescription(obligation({ kind: 'annual-renewal', coveragePeriod }))).toBe('BsDelivery — renovação da assinatura anual (28/11/2026 a 28/11/2027)');
  });

  it('diferença de estorno', () => {
    expect(obligationChargeDescription(obligation({ kind: 'refund-difference' }))).toBe('BsDelivery — diferença de estorno parcial da assinatura');
  });
});
