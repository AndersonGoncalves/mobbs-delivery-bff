import { cashRegisterDate, cashRegisterDayBounds, cashRegisterPeriodEnd, nextAutoCloseAt } from './cash-register-date';
import { ICashRegisterSession } from './entities/cash-register.entity';

const session: ICashRegisterSession = {
  id: 'old', restaurantId: 'r', status: 'aberto', openingBalance: 0,
  openedAt: '2026-10-23T11:00:00Z',
};

describe('caixa por data civil (0176)', () => {
  it('vira a data à meia-noite de São Paulo, não à meia-noite UTC', () => {
    expect(cashRegisterDate(new Date('2026-10-24T02:59:59Z'))).toBe('2026-10-23');
    expect(cashRegisterDate(new Date('2026-10-24T03:00:00Z'))).toBe('2026-10-24');
    expect(cashRegisterDayBounds('2026-10-24')).toEqual({
      from: new Date('2026-10-24T03:00:00Z'), to: new Date('2026-10-25T03:00:00Z'),
    });
  });

  // Pedido explícito do usuário (follow-up, achado real 06/11/2026) — substitui a regra antiga de
  // travar o período na virada da data civil (ver `cashRegisterPeriodEnd`, cabeçalho completo do
  // motivo): o período de uma sessão agora é sempre sua vida real, sem teto de meia-noite.
  it('caixa ainda aberto soma até agora, mesmo depois de virar o dia', () => {
    expect(cashRegisterPeriodEnd(session, new Date('2026-10-24T12:00:00Z')))
      .toEqual(new Date('2026-10-24T12:00:00Z'));
  });

  it('não reinterpreta fechamentos históricos legados', () => {
    expect(cashRegisterPeriodEnd({ ...session, status: 'fechado', closedAt: '2026-10-25T12:00:00Z' }))
      .toEqual(new Date('2026-10-25T12:00:00Z'));
  });

  it('fechamento manual tardio de novo caixa usa o horário real do fechamento, não a meia-noite', () => {
    expect(cashRegisterPeriodEnd({ ...session, businessDate: '2026-10-23', closedAt: '2026-10-25T12:00:00Z' }))
      .toEqual(new Date('2026-10-25T12:00:00Z'));
  });

  it('accountingEndAt já gravado (sessão fechada) sempre vence, mesmo com closedAt diferente', () => {
    expect(cashRegisterPeriodEnd({ ...session, status: 'fechado', closedAt: '2026-10-25T12:00:00Z', accountingEndAt: '2026-10-25T09:00:00Z' }))
      .toEqual(new Date('2026-10-25T09:00:00Z'));
  });
});

// specs/0216-fechamento-automatico-caixa T009.
describe('nextAutoCloseAt — 1º horário de fechamento DEPOIS da abertura (horário de Brasília)', () => {
  const iso = (date: Date) => date.toISOString();

  it('aberta 09:23 com 04:00 → 04:00 do dia seguinte (o caso real)', () => {
    expect(iso(nextAutoCloseAt(new Date('2026-11-24T12:23:51.000Z'), '04:00'))).toBe('2026-11-25T07:00:00.000Z');
  });

  it('aberta 09:00 com 23:00 → 23:00 do mesmo dia', () => {
    expect(iso(nextAutoCloseAt(new Date('2026-11-24T12:00:00.000Z'), '23:00'))).toBe('2026-11-25T02:00:00.000Z');
  });

  it('aberta 02:00 com 04:00 → 04:00 do mesmo dia (madrugada antes do horário)', () => {
    expect(iso(nextAutoCloseAt(new Date('2026-11-24T05:00:00.000Z'), '04:00'))).toBe('2026-11-24T07:00:00.000Z');
  });

  it('aberta exatamente no horário → próximo dia (nunca fecha no instante em que abriu)', () => {
    expect(iso(nextAutoCloseAt(new Date('2026-11-24T07:00:00.000Z'), '04:00'))).toBe('2026-11-25T07:00:00.000Z');
  });

  it('aberta 23:30 com 23:00 → 23:00 do dia seguinte', () => {
    expect(iso(nextAutoCloseAt(new Date('2026-11-25T02:30:00.000Z'), '23:00'))).toBe('2026-11-26T02:00:00.000Z');
  });

  it('aberta às 22:00 de Brasília (já é outro dia em UTC) usa a data de Brasília', () => {
    // 2026-11-24 22:00 BRT = 2026-11-25 01:00 UTC; o próximo 04:00 é 25/11 04:00 BRT.
    expect(iso(nextAutoCloseAt(new Date('2026-11-25T01:00:00.000Z'), '04:00'))).toBe('2026-11-25T07:00:00.000Z');
  });

  it('aceita horário sem zero à esquerda (ex. "4:00")', () => {
    expect(iso(nextAutoCloseAt(new Date('2026-11-24T12:00:00.000Z'), '4:00'))).toBe('2026-11-25T07:00:00.000Z');
  });
});

