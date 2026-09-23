import { IBusinessHours } from './entities/restaurant.entity';
import { isRestaurantOpenNow } from './is-restaurant-open-now';

// Terça-feira, 20:00 — dentro do horário "normal" usado nos testes abaixo.
const TUESDAY_8PM = new Date('2026-09-22T20:00:00');

function buildHours(overrides: Partial<IBusinessHours> = {}): IBusinessHours {
  return { dayOfWeek: 'tuesday', isClosed: false, openTime: '18:00', closeTime: '23:00', ...overrides };
}

describe('isRestaurantOpenNow (specs/0055-checkout-revalida-restaurante-aberto, reabre 0046/0033)', () => {
  it('AC-1: isActive:false fecha independente do horário — mesma prioridade de Restaurant.isOpenAt() no app', () => {
    const restaurant = { isActive: false, businessHours: [buildHours()] };

    expect(isRestaurantOpenNow(restaurant, TUESDAY_8PM)).toBe(false);
  });

  it('isActive:true e dentro do horário do dia -> aberto', () => {
    const restaurant = { isActive: true, businessHours: [buildHours()] };

    expect(isRestaurantOpenNow(restaurant, TUESDAY_8PM)).toBe(true);
  });

  it('isActive:true mas fora do horário do dia -> fechado', () => {
    const restaurant = { isActive: true, businessHours: [buildHours({ openTime: '18:00', closeTime: '19:00' })] };

    expect(isRestaurantOpenNow(restaurant, TUESDAY_8PM)).toBe(false);
  });

  it('dia marcado isClosed:true -> fechado, mesmo com openTime/closeTime preenchidos', () => {
    const restaurant = { isActive: true, businessHours: [buildHours({ isClosed: true })] };

    expect(isRestaurantOpenNow(restaurant, TUESDAY_8PM)).toBe(false);
  });

  it('sem horário cadastrado pro dia da semana atual -> fechado', () => {
    const restaurant = { isActive: true, businessHours: [buildHours({ dayOfWeek: 'monday' })] };

    expect(isRestaurantOpenNow(restaurant, TUESDAY_8PM)).toBe(false);
  });

  it('businessHours vazio -> fechado', () => {
    const restaurant = { isActive: true, businessHours: [] };

    expect(isRestaurantOpenNow(restaurant, TUESDAY_8PM)).toBe(false);
  });

  it('no limite exato do horário de fechamento (23:00), já conta como fechado', () => {
    const restaurant = { isActive: true, businessHours: [buildHours()] };
    const exactlyClosingTime = new Date('2026-09-22T23:00:00');

    expect(isRestaurantOpenNow(restaurant, exactlyClosingTime)).toBe(false);
  });
});
