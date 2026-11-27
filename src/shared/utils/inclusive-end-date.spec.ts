import { isReversedRange, toInclusiveEndDate } from './inclusive-end-date';

describe('toInclusiveEndDate (specs/0231)', () => {
  it('data pura vira o último instante do dia em UTC', () => {
    expect(toInclusiveEndDate('2026-01-31')).toEqual(new Date('2026-01-31T23:59:59.999Z'));
  });

  it('ISO com horário é usado como veio', () => {
    expect(toInclusiveEndDate('2026-02-01T02:59:59.999Z')).toEqual(new Date('2026-02-01T02:59:59.999Z'));
  });
});

describe('isReversedRange (specs/0231 AC-4)', () => {
  it('de depois de até → true', () => {
    expect(isReversedRange('2026-02-01', '2026-01-31')).toBe(true);
  });

  it('mesmo dia (data pura) → false', () => {
    expect(isReversedRange('2026-01-31', '2026-01-31')).toBe(false);
  });

  it('só um dos limites → false', () => {
    expect(isReversedRange('2026-02-01', undefined)).toBe(false);
    expect(isReversedRange(undefined, '2026-01-31')).toBe(false);
  });
});
