import { cashRegisterDate, cashRegisterDayBounds, cashRegisterPeriodEnd } from './cash-register-date';
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

  it('caixa pendente termina seu período na virada de sua data', () => {
    expect(cashRegisterPeriodEnd(session, new Date('2026-10-24T12:00:00Z')))
      .toEqual(new Date('2026-10-24T03:00:00Z'));
  });

  it('não reinterpreta fechamentos históricos legados', () => {
    expect(cashRegisterPeriodEnd({ ...session, status: 'fechado', closedAt: '2026-10-25T12:00:00Z' }))
      .toEqual(new Date('2026-10-25T12:00:00Z'));
  });

  it('fechamento manual tardio de novo caixa mantém período da data original', () => {
    expect(cashRegisterPeriodEnd({ ...session, businessDate: '2026-10-23', closedAt: '2026-10-25T12:00:00Z' }))
      .toEqual(new Date('2026-10-24T03:00:00Z'));
  });
});
