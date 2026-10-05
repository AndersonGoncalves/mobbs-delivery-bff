import { PlatformController } from './platform.controller';
import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import { IOrder } from '../../orders/domain/entities/order.entity';

type Handler = (req: unknown, res: unknown) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, Handler[]> = {};
  const register = (method: string) => (path: string, ...handlers: Handler[]) => {
    routes[`${method} ${path}`] = handlers;
  };
  const application = { get: register('GET'), patch: register('PATCH') };
  return { application: application as never, routes };
}

async function run(handlers: Handler[], req: unknown, res: unknown) {
  // Pula a checagem de Firebase (tem spec própria) e executa o middleware de admin + handler.
  for (const handler of handlers.slice(1)) {
    await handler(req, res);
  }
}

function buildRestaurant(overrides: Partial<IRestaurant> = {}): IRestaurant {
  return { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', ...overrides } as IRestaurant;
}

function delivered(total: number, createdAt = '2026-10-02T12:00:00Z'): IOrder {
  return { id: `o-${total}`, total, orderNumber: 1, status: 'entregue', createdAt: new Date(createdAt) } as unknown as IOrder;
}

function setup(options: { restaurants: IRestaurant[]; ordersByRestaurant?: Record<string, IOrder[]>; lastDelivered?: Record<string, Date | null> }) {
  const restaurantRepository = {
    listAll: jest.fn().mockResolvedValue(options.restaurants),
    findById: jest.fn().mockImplementation(async (id: string) => options.restaurants.find((r) => r.id === id) ?? null),
    updateBilling: jest.fn().mockImplementation(async (id: string, billing: unknown) => buildRestaurant({ id, billing: billing as IRestaurant['billing'] })),
  };
  const orderRepository = {
    findDeliveredByRestaurantBetween: jest.fn().mockImplementation(async (id: string) => options.ordersByRestaurant?.[id] ?? []),
    findLastDeliveredAt: jest.fn().mockImplementation(async (id: string) => options.lastDelivered?.[id] ?? null),
  };
  const { application, routes } = buildFakeApplication();
  new PlatformController(restaurantRepository as never, orderRepository as never, (async () => undefined) as never).initializeRoutes(application);
  return { restaurantRepository, orderRepository, routes };
}

describe('PlatformController (specs/0106)', () => {
  it('AC-2: lista todos os restaurantes com faturamento do mês, plano, status e último pedido', async () => {
    const billing = { referenceMonth: '2026-10', currentTier: 'pro' as const, notified75Percent: false, notifiedTierUpgrade: false, status: 'blocked' as const, cycle: 'monthly' as const };
    const { routes } = setup({
      restaurants: [buildRestaurant({ id: 'r-1', billing }), buildRestaurant({ id: 'r-2', name: 'Burger', slug: 'burger' })],
      ordersByRestaurant: { 'r-1': [delivered(1500), delivered(700)] },
      lastDelivered: { 'r-1': new Date('2026-10-02T12:00:00Z') },
    });
    const json = jest.fn();

    await run(routes['GET /platform/restaurants'], {}, { json });

    const rows = json.mock.calls[0][1];
    expect(rows[0]).toMatchObject({ id: 'r-1', tier: 'pro', status: 'blocked', blocked: true, revenueCents: 220000, lastDeliveredAt: '2026-10-02T12:00:00.000Z' });
    expect(rows[1]).toMatchObject({ id: 'r-2', tier: 'free', status: 'ok', blocked: false, revenueCents: 0, lastDeliveredAt: null });
  });

  it('AC-3: bloquear grava status blocked e mantém faixa e ciclo', async () => {
    const billing = { referenceMonth: '2026-10', currentTier: 'pro' as const, notified75Percent: true, notifiedTierUpgrade: false, status: 'ok' as const, cycle: 'annual' as const };
    const { restaurantRepository, routes } = setup({ restaurants: [buildRestaurant({ billing })] });
    const json = jest.fn();

    await run(routes['PATCH /platform/restaurants/:id/billing'], { params: { id: 'r-1' }, body: { status: 'blocked' } }, { json });

    expect(restaurantRepository.updateBilling).toHaveBeenCalledWith('r-1', expect.objectContaining({ status: 'blocked', cycle: 'annual', currentTier: 'pro', notified75Percent: true }));
  });

  it('AC-3: desbloquear grava status ok', async () => {
    const billing = { referenceMonth: '2026-10', currentTier: 'pro' as const, notified75Percent: false, notifiedTierUpgrade: false, status: 'blocked' as const, cycle: 'monthly' as const };
    const { restaurantRepository, routes } = setup({ restaurants: [buildRestaurant({ billing })] });

    await run(routes['PATCH /platform/restaurants/:id/billing'], { params: { id: 'r-1' }, body: { status: 'ok' } }, { json: jest.fn() });

    expect(restaurantRepository.updateBilling).toHaveBeenCalledWith('r-1', expect.objectContaining({ status: 'ok' }));
  });

  it('AC-4: trocar o ciclo para anual mantém status e faixa', async () => {
    const billing = { referenceMonth: '2026-10', currentTier: 'pro' as const, notified75Percent: false, notifiedTierUpgrade: false, status: 'blocked' as const, cycle: 'monthly' as const };
    const { restaurantRepository, routes } = setup({ restaurants: [buildRestaurant({ billing })] });

    await run(routes['PATCH /platform/restaurants/:id/billing'], { params: { id: 'r-1' }, body: { cycle: 'annual' } }, { json: jest.fn() });

    expect(restaurantRepository.updateBilling).toHaveBeenCalledWith('r-1', expect.objectContaining({ cycle: 'annual', status: 'blocked', currentTier: 'pro' }));
  });

  it('corpo vazio ou com valor inválido é recusado sem gravar', async () => {
    const { restaurantRepository, routes } = setup({ restaurants: [buildRestaurant()] });

    await expect(run(routes['PATCH /platform/restaurants/:id/billing'], { params: { id: 'r-1' }, body: {} }, { json: jest.fn() })).rejects.toMatchObject({ statusCode: 400 });
    await expect(run(routes['PATCH /platform/restaurants/:id/billing'], { params: { id: 'r-1' }, body: { status: 'talvez' } }, { json: jest.fn() })).rejects.toMatchObject({ statusCode: 400 });
    expect(restaurantRepository.updateBilling).not.toHaveBeenCalled();
  });

  it('restaurante inexistente recebe 404', async () => {
    const { restaurantRepository, routes } = setup({ restaurants: [] });

    await expect(run(routes['PATCH /platform/restaurants/:id/billing'], { params: { id: 'x' }, body: { status: 'ok' } }, { json: jest.fn() })).rejects.toMatchObject({ statusCode: 404 });
    expect(restaurantRepository.updateBilling).not.toHaveBeenCalled();
  });
});
