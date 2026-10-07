import type { IRestaurant, IRestaurantBilling } from '../../restaurants/domain/entities/restaurant.entity';
import type { IOrder } from '../../orders/domain/entities/order.entity';
import { DEFAULT_BILLING_SETTINGS } from './billing';
import { RecomputeRestaurantBillingUseCase } from './recompute-restaurant-billing.use-case';

function buildRestaurant(overrides: Partial<IRestaurant> = {}): IRestaurant {
  return { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', phone: '5511999999999', ...overrides } as IRestaurant;
}

function delivered(total: number): IOrder {
  return { id: `o-${total}`, total, orderNumber: 1, status: 'entregue' } as unknown as IOrder;
}

const NOW = new Date('2026-10-15T15:00:00Z');

function setup(options: { orders: IOrder[]; restaurant?: IRestaurant }) {
  let stored: IRestaurantBilling | undefined = options.restaurant?.billing;
  const base = options.restaurant ?? buildRestaurant();
  const restaurantRepository = {
    // Lê o estado mais recente gravado, como o banco faria entre duas execuções.
    findById: jest.fn().mockImplementation(async () => ({ ...base, billing: stored })),
    updateBilling: jest.fn().mockImplementation(async (_id: string, billing: IRestaurantBilling) => {
      stored = billing;
      return buildRestaurant({ billing });
    }),
  };
  const orderRepository = { findDeliveredByRestaurantBetween: jest.fn().mockResolvedValue(options.orders) };
  const notifier = { notifyRestaurant: jest.fn().mockResolvedValue(undefined) };
  // specs/0113-parametrizacao-faixas-cobranca — sem configuração salva nestes testes: usa o default.
  const billingSettingsRepository = { get: jest.fn().mockResolvedValue(DEFAULT_BILLING_SETTINGS), update: jest.fn() };
  const useCase = new RecomputeRestaurantBillingUseCase({ restaurantRepository, orderRepository, notifier, billingSettingsRepository });
  return { useCase, restaurantRepository, notifier, stored: () => stored };
}

describe('RecomputeRestaurantBillingUseCase (specs/0042 REQ-1/REQ-2/REQ-3/REQ-4)', () => {
  it('AC-1: o faturamento vem só dos pedidos entregues que o repositório devolve (abaixo de R$ 2.000 = gratuito)', async () => {
    const { useCase, stored } = setup({ orders: [delivered(600), delivered(600), delivered(600)] });

    await useCase.call('r-1', NOW);

    expect(stored()?.currentTier).toBe('free');
  });

  it('AC-2: cruzar R$ 2.000 muda o plano pra Pro e avisa com a mensalidade', async () => {
    const { useCase, stored, notifier } = setup({ orders: [delivered(1950), delivered(100)] });

    await useCase.call('r-1', NOW);

    expect(stored()?.currentTier).toBe('pro');
    expect(notifier.notifyRestaurant).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('R$ 79,90/mês'));
  });

  it('AC-3: o aviso de 75% dispara uma única vez por mês', async () => {
    const { useCase, notifier, stored } = setup({ orders: [delivered(1500)] });

    await useCase.call('r-1', NOW);
    await useCase.call('r-1', NOW);

    const warnings = notifier.notifyRestaurant.mock.calls.filter(([, text]) => String(text).includes('perto do limite'));
    expect(warnings).toHaveLength(1);
    expect(stored()?.notified75Percent).toBe(true);
  });

  it('um mês novo zera os avisos já enviados', async () => {
    const restaurant = buildRestaurant({
      billing: { referenceMonth: '2026-09', currentTier: 'pro', notified75Percent: true, notifiedTierUpgrade: true, status: 'ok', cycle: 'monthly' },
    });
    const { useCase, stored } = setup({ orders: [delivered(1500)], restaurant });

    await useCase.call('r-1', NOW);

    expect(stored()?.referenceMonth).toBe('2026-10');
    expect(stored()?.currentTier).toBe('free');
    expect(stored()?.notified75Percent).toBe(true);
    expect(stored()?.notifiedTierUpgrade).toBe(false);
  });

  it('mantém o status e o ciclo marcados manualmente ao recalcular', async () => {
    const restaurant = buildRestaurant({
      billing: { referenceMonth: '2026-10', currentTier: 'pro', notified75Percent: false, notifiedTierUpgrade: false, status: 'blocked', cycle: 'annual' },
    });
    const { useCase, stored } = setup({ orders: [delivered(2500)], restaurant });

    await useCase.call('r-1', NOW);

    expect(stored()?.status).toBe('blocked');
    expect(stored()?.cycle).toBe('annual');
  });
});
