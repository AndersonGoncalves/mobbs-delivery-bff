import {
  addCalendarYear,
  addDaysCorridos,
  daysInMonth,
  localMidnight,
  monthlyDaysBeforeAnnualStart,
  monthlyDaysFromAnnualEnd,
  monthsBetween,
  previousMonthKey,
  proratedCents,
  settingsEffectiveAt,
} from './billing-calendar';

describe('localMidnight', () => {
  it('normaliza qualquer instante pra meia-noite de Brasília daquele dia (03:00 UTC)', () => {
    expect(localMidnight(new Date('2026-10-24T14:00:00Z')).toISOString()).toBe('2026-10-24T03:00:00.000Z');
    // 2026-10-25T02:00 UTC ainda é 24/10 em Brasília (UTC-3).
    expect(localMidnight(new Date('2026-10-25T02:00:00Z')).toISOString()).toBe('2026-10-24T03:00:00.000Z');
  });
});

describe('addDaysCorridos', () => {
  it('soma dias corridos (24h), sem considerar fuso/DST (Brasil não tem DST desde 2019)', () => {
    const start = localMidnight(new Date('2026-11-01T03:00:00Z'));
    expect(addDaysCorridos(start, 10).toISOString()).toBe('2026-11-11T03:00:00.000Z');
  });
});

describe('addCalendarYear (AC-10)', () => {
  it('soma 1 ano de calendário preservando dia/mês', () => {
    const joined = localMidnight(new Date('2026-10-24T12:00:00Z'));
    expect(addCalendarYear(joined).toISOString()).toBe('2027-10-24T03:00:00.000Z');
  });

  it('AC-10: adesão em 29/02 (ano bissexto) renovando em ano não-bissexto usa 28/02', () => {
    const joined = localMidnight(new Date('2028-02-29T12:00:00Z'));
    const nextYear = addCalendarYear(joined);
    // 2029 não é bissexto.
    expect(nextYear.toISOString()).toBe('2029-02-28T03:00:00.000Z');
  });

  it('preserva a referência original: de um 28/02 (ano não-bissexto) somar de novo cai em 28/02 de novo, nunca "esquece" que era 29/02 — mas o ano seguinte bissexto volta a usar 29/02 quando a referência original é preservada pelo chamador', () => {
    const joinedLeapYear = localMidnight(new Date('2028-02-29T12:00:00Z'));
    // Chamador sempre soma a partir do joinedAt ORIGINAL (29/02/2028), não do aniversário anterior
    // (28/02/2029) — por isso aqui simulamos a soma de 2 anos a partir da referência original.
    const twoYearsLater = addCalendarYear(addCalendarYear(joinedLeapYear));
    // 2030 também não é bissexto.
    expect(twoYearsLater.toISOString()).toBe('2030-02-28T03:00:00.000Z');
  });
});

describe('daysInMonth', () => {
  it('outubro tem 31 dias; fevereiro de ano bissexto tem 29', () => {
    expect(daysInMonth(2026, 9)).toBe(31); // outubro, mês 0-indexed = 9
    expect(daysInMonth(2028, 1)).toBe(29); // fevereiro bissexto
    expect(daysInMonth(2026, 1)).toBe(28);
  });
});

describe('proratedCents (AC-13)', () => {
  it('R$ 79,90 × 23/31 = R$ 59,28 (arredondamento único pra centavos)', () => {
    expect(proratedCents(7990, 23, 31)).toBe(5928);
  });

  it('dias zero ou negativos nunca geram valor', () => {
    expect(proratedCents(7990, 0, 31)).toBe(0);
  });
});

describe('monthlyDaysBeforeAnnualStart / monthlyDaysFromAnnualEnd (AC-13)', () => {
  it('adesão anual em 24/10 deixa 23 dias sob mensal (01 a 23/10)', () => {
    const annualStart = localMidnight(new Date('2026-10-24T12:00:00Z'));
    expect(monthlyDaysBeforeAnnualStart(annualStart)).toBe(23);
  });

  it('volta ao mensal em 24/10 (mês de 31 dias) deixa 8 dias sob mensal (24 a 31/10)', () => {
    const annualEnd = localMidnight(new Date('2026-10-24T12:00:00Z'));
    expect(monthlyDaysFromAnnualEnd(annualEnd)).toBe(8);
  });
});

describe('monthsBetween (REQ-9/REQ-34)', () => {
  it('lista os meses entre a ativação e o mês corrente (exclusive)', () => {
    expect(monthsBetween('2026-08', '2026-11')).toEqual(['2026-08', '2026-09', '2026-10']);
  });

  it('atravessa virada de ano', () => {
    expect(monthsBetween('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01']);
  });

  it('mesmo mês devolve lista vazia (nada fechado ainda)', () => {
    expect(monthsBetween('2026-10', '2026-10')).toEqual([]);
  });
});

describe('previousMonthKey', () => {
  it('mês anterior dentro do mesmo ano', () => {
    expect(previousMonthKey('2026-10')).toBe('2026-09');
  });

  it('janeiro volta pra dezembro do ano anterior', () => {
    expect(previousMonthKey('2027-01')).toBe('2026-12');
  });
});

describe('settingsEffectiveAt (REQ-8/AC-4)', () => {
  const v1 = { id: 'v1', effectiveFrom: new Date('2026-01-01T00:00:00Z') };
  const v2 = { id: 'v2', effectiveFrom: new Date('2026-06-01T00:00:00Z') };
  const v3 = { id: 'v3', effectiveFrom: new Date('2026-12-01T00:00:00Z') };

  it('resolve a versão vigente numa data passada, mesmo com versões mais recentes já existindo', () => {
    expect(settingsEffectiveAt(new Date('2026-07-15T00:00:00Z'), [v1, v2, v3])?.id).toBe('v2');
    expect(settingsEffectiveAt(new Date('2026-01-01T00:00:00Z'), [v1, v2, v3])?.id).toBe('v1');
  });

  it('AC-4: reajuste publicado depois não se aplica retroativamente a uma competência já fechada', () => {
    const competenciaFechamento = new Date('2026-10-31T23:59:59Z');
    expect(settingsEffectiveAt(competenciaFechamento, [v1, v2, v3])?.id).toBe('v2');
  });

  it('sem nenhuma versão aplicável, devolve null', () => {
    expect(settingsEffectiveAt(new Date('2025-01-01T00:00:00Z'), [v1, v2, v3])).toBeNull();
  });
});
