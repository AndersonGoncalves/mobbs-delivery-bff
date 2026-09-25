import { IBusinessHours } from './entities/restaurant.entity';
import { isRestaurantOpenNow } from './is-restaurant-open-now';

// Terça-feira, 20:00 em Brasília (UTC-3) — dentro do horário "normal" usado nos testes abaixo.
// Sempre em UTC explícito (sufixo `Z`) porque `isRestaurantOpenNow` agora fixa o fuso em
// `America/Sao_Paulo` independente do fuso da máquina rodando o teste.
const TUESDAY_8PM_BRT = new Date('2026-09-22T23:00:00Z');

function buildHours(overrides: Partial<IBusinessHours> = {}): IBusinessHours {
  return { dayOfWeek: 'tuesday', isClosed: false, openTime: '18:00', closeTime: '23:00', ...overrides };
}

describe('isRestaurantOpenNow (specs/0055-checkout-revalida-restaurante-aberto, reabre 0046/0033)', () => {
  it('AC-1: isActive:false fecha independente do horário — mesma prioridade de Restaurant.isOpenAt() no app', () => {
    const restaurant = { isActive: false, businessHours: [buildHours()] };

    expect(isRestaurantOpenNow(restaurant, TUESDAY_8PM_BRT)).toBe(false);
  });

  it('isActive:true e dentro do horário do dia -> aberto', () => {
    const restaurant = { isActive: true, businessHours: [buildHours()] };

    expect(isRestaurantOpenNow(restaurant, TUESDAY_8PM_BRT)).toBe(true);
  });

  it('isActive:true mas fora do horário do dia -> fechado', () => {
    const restaurant = { isActive: true, businessHours: [buildHours({ openTime: '18:00', closeTime: '19:00' })] };

    expect(isRestaurantOpenNow(restaurant, TUESDAY_8PM_BRT)).toBe(false);
  });

  it('dia marcado isClosed:true -> fechado, mesmo com openTime/closeTime preenchidos', () => {
    const restaurant = { isActive: true, businessHours: [buildHours({ isClosed: true })] };

    expect(isRestaurantOpenNow(restaurant, TUESDAY_8PM_BRT)).toBe(false);
  });

  it('sem horário cadastrado pro dia da semana atual -> fechado', () => {
    const restaurant = { isActive: true, businessHours: [buildHours({ dayOfWeek: 'monday' })] };

    expect(isRestaurantOpenNow(restaurant, TUESDAY_8PM_BRT)).toBe(false);
  });

  it('businessHours vazio -> fechado', () => {
    const restaurant = { isActive: true, businessHours: [] };

    expect(isRestaurantOpenNow(restaurant, TUESDAY_8PM_BRT)).toBe(false);
  });

  it('no limite exato do horário de fechamento (23:00 BRT), já conta como fechado', () => {
    const restaurant = { isActive: true, businessHours: [buildHours()] };
    const exactlyClosingTime = new Date('2026-09-23T02:00:00Z'); // 23:00 BRT de terça = 02:00 UTC de quarta

    expect(isRestaurantOpenNow(restaurant, exactlyClosingTime)).toBe(false);
  });

  // Regressão: bug real de produção. O container do BFF roda em UTC (sem `TZ` no Dockerfile) —
  // `Date.getDay()`/`getHours()` (usados antes desta correção) seguiam o fuso do processo, não o
  // de Brasília. Às 22h de terça em Brasília já é quarta em UTC — a função antiga consultava o
  // horário de quarta (ou nenhum) pro pedido de terça, e um restaurante genuinamente aberto
  // recebia 409 "Restaurante fechado no momento" incorretamente.
  it('regressão: 22h de terça em Brasília (já quarta em UTC) continua aberto se o horário permitir', () => {
    const restaurant = {
      isActive: true,
      businessHours: [buildHours({ dayOfWeek: 'tuesday', openTime: '18:00', closeTime: '23:00' })],
    };
    const tuesday10PmBrt = new Date('2026-09-23T01:00:00Z'); // 22:00 BRT de terça = 01:00 UTC de quarta

    expect(isRestaurantOpenNow(restaurant, tuesday10PmBrt)).toBe(true);
  });

  it('regressão: meia-noite em Brasília (quirk do ICU: hour vem como "24") é tratada como 00:00, não como fechado por padrão', () => {
    const restaurant = {
      isActive: true,
      businessHours: [buildHours({ dayOfWeek: 'thursday', openTime: '00:00', closeTime: '02:00' })],
    };
    const midnightBrt = new Date('2026-09-24T03:00:00Z'); // 00:00 BRT de quinta = 03:00 UTC de quinta

    expect(isRestaurantOpenNow(restaurant, midnightBrt)).toBe(true);
  });
});
