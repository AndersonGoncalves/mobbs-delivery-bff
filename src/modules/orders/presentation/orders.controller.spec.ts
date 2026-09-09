import type { Request, Response, Server } from 'restify';

import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IOrderRepository } from '../domain/repositories/order.repository.interface';
import { OrdersController } from './orders.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { user?: { uid: string; email?: string } };
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    post: (path: string, ...handlers: RouteHandler[]) => {
      routes[`POST ${path}`] = handlers;
    },
    get: (path: string, ...handlers: RouteHandler[]) => {
      routes[`GET ${path}`] = handlers;
    },
    patch: (path: string, ...handlers: RouteHandler[]) => {
      routes[`PATCH ${path}`] = handlers;
    },
  };
  return { application: application as unknown as Server, routes };
}

// Pula firebaseAuthMiddleware (primeiro da chain) — tem spec própria — e injeta `req.user`
// manualmente, como o middleware real faria.
async function runAuthenticatedChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) {
    await handler(req, res);
  }
}

// GET /orders/track/:token não tem firebaseAuthMiddleware (rota pública, REQ-8) — roda todos os
// handlers, sem pular o primeiro.
async function runPublicChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers) {
    await handler(req, res);
  }
}

function buildRestaurant(overrides: Partial<{ isActive: boolean; deliveryFeeCents: number }> = {}) {
  return {
    id: 'r-1',
    name: 'Prime Pizza',
    slug: 'primepizza',
    isActive: true,
    businessHours: [],
    minimumOrderValue: 0,
    deliveryFeeCents: 5,
    ...overrides,
  };
}

function buildItem(overrides: Partial<{ unitPrice: number; quantity: number }> = {}) {
  return {
    id: 'i-1',
    productId: 'p-1',
    productName: 'Pizza',
    quantity: 1,
    unitPrice: 25,
    selections: [],
    ...overrides,
  };
}

function buildValidBody(overrides: Record<string, unknown> = {}) {
  return {
    restaurantId: 'r-1',
    items: [buildItem()],
    orderType: 'delivery',
    deliveryAddress: 'Rua A, 123',
    paymentMethod: 'cash',
    ...overrides,
  };
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o-1',
    orderNumber: 1,
    trackingToken: 'token-1',
    customerId: 'customer-1',
    restaurantId: 'r-1',
    items: [buildItem()],
    orderType: 'delivery',
    deliveryAddress: 'Rua A, 123',
    status: 'aguardandoConfirmacao',
    statusHistory: [{ status: 'aguardandoConfirmacao', changedAt: new Date().toISOString() }],
    subtotal: 25,
    deliveryFee: 5,
    discount: 0,
    total: 30,
    paymentMethod: 'cash',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('OrdersController', () => {
  function setup(overrides: { orderRepository?: Partial<IOrderRepository>; restaurantRepository?: Partial<IRestaurantRepository> } = {}) {
    const orderRepository: Partial<IOrderRepository> = {
      create: jest.fn().mockImplementation(async (input) => ({
        id: 'o-1',
        orderNumber: 1,
        trackingToken: 'token-1',
        status: 'aguardandoConfirmacao',
        statusHistory: [],
        createdAt: new Date().toISOString(),
        ...input,
      })),
      findManyByCustomer: jest.fn().mockResolvedValue([buildOrder()]),
      findById: jest.fn().mockResolvedValue(buildOrder()),
      findByTrackingToken: jest.fn().mockResolvedValue(buildOrder()),
      updateStatus: jest.fn().mockImplementation(async (id, status, changedBy) => ({
        ...buildOrder(),
        status,
        statusHistory: [...buildOrder().statusHistory, { status, changedAt: new Date().toISOString(), changedBy }],
      })),
      ...overrides.orderRepository,
    };
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue(buildRestaurant()),
      ...overrides.restaurantRepository,
    };
    const { application, routes } = buildFakeApplication();
    new OrdersController(orderRepository as IOrderRepository, restaurantRepository as IRestaurantRepository).initializeRoutes(
      application,
    );
    return { orderRepository, restaurantRepository, routes };
  }

  it('AC-2: POST /orders cria o pedido com subtotal/taxa/total calculados no BFF (não confia no cliente)', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['POST /orders'],
      { body: buildValidBody({ items: [buildItem({ unitPrice: 25, quantity: 2 })] }), user: { uid: 'customer-1' } },
      { json },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'customer-1', subtotal: 50, deliveryFee: 5, discount: 0, total: 55 }),
    );
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'o-1', orderNumber: 1 }));
  });

  it('Retirada (pickup): taxa de entrega é zero mesmo com Restaurant.deliveryFeeCents > 0', async () => {
    const { orderRepository, routes } = setup();

    await runAuthenticatedChain(
      routes['POST /orders'],
      {
        body: buildValidBody({ orderType: 'pickup', deliveryAddress: undefined }),
        user: { uid: 'customer-1' },
      },
      { json: jest.fn() },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ deliveryFee: 0, total: 25 }));
  });

  it('rejeita Delivery sem deliveryAddress', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(
        routes['POST /orders'],
        { body: buildValidBody({ deliveryAddress: undefined }), user: { uid: 'customer-1' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejeita Cartão de Crédito sem cardBrand', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(
        routes['POST /orders'],
        { body: buildValidBody({ paymentMethod: 'creditCard' }), user: { uid: 'customer-1' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('aceita Cartão de Crédito com cardBrand informado', async () => {
    const { orderRepository, routes } = setup();

    await runAuthenticatedChain(
      routes['POST /orders'],
      {
        body: buildValidBody({ paymentMethod: 'creditCard', cardBrand: 'Visa' }),
        user: { uid: 'customer-1' },
      },
      { json: jest.fn() },
    );

    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ cardBrand: 'Visa' }));
  });

  it('lança 404 quando o restaurante não existe', async () => {
    const { routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue(null) } });

    await expect(
      runAuthenticatedChain(routes['POST /orders'], { body: buildValidBody(), user: { uid: 'customer-1' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-1: GET /orders lista os pedidos do próprio cliente', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /orders'], { user: { uid: 'customer-1' } }, { json });

    expect(orderRepository.findManyByCustomer).toHaveBeenCalledWith('customer-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'o-1' })]);
  });

  it('AC-2: GET /orders/:id retorna o detalhe de um pedido do próprio cliente', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /orders/:id'], { params: { id: 'o-1' }, user: { uid: 'customer-1' } }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ id: 'o-1' }));
  });

  it('GET /orders/:id lança 404 quando o pedido é de outro cliente', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(
        routes['GET /orders/:id'],
        { params: { id: 'o-1' }, user: { uid: 'outro-customer' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-6: PATCH /orders/:id/cancel cancela um pedido aguardandoConfirmacao', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(
      routes['PATCH /orders/:id/cancel'],
      { params: { id: 'o-1' }, user: { uid: 'customer-1' } },
      { json },
    );

    expect(orderRepository.updateStatus).toHaveBeenCalledWith('o-1', 'cancelado', 'customer-1');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'cancelado' }));
  });

  it('AC-6: PATCH /orders/:id/cancel rejeita quando o pedido não está mais aguardandoConfirmacao', async () => {
    const { orderRepository, routes } = setup({
      orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ status: 'confirmado' })) },
    });

    await expect(
      runAuthenticatedChain(
        routes['PATCH /orders/:id/cancel'],
        { params: { id: 'o-1' }, user: { uid: 'customer-1' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('PATCH /orders/:id/cancel lança 404 quando o pedido é de outro cliente', async () => {
    const { routes } = setup();

    await expect(
      runAuthenticatedChain(
        routes['PATCH /orders/:id/cancel'],
        { params: { id: 'o-1' }, user: { uid: 'outro-customer' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-8: GET /orders/track/:token é público e devolve só o necessário pra tela', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runPublicChain(routes['GET /orders/track/:token'], { params: { token: 'token-1' } }, { json });

    expect(orderRepository.findByTrackingToken).toHaveBeenCalledWith('token-1');
    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(payload).toMatchObject({ orderNumber: 1, status: 'aguardandoConfirmacao' });
    expect(payload).not.toHaveProperty('customerId');
    expect(payload).not.toHaveProperty('restaurantId');
    expect(payload).not.toHaveProperty('deliveryAddress');
  });

  it('GET /orders/track/:token lança 404 quando o token não existe', async () => {
    const { routes } = setup({ orderRepository: { findByTrackingToken: jest.fn().mockResolvedValue(null) } });

    await expect(
      runPublicChain(routes['GET /orders/track/:token'], { params: { token: 'inexistente' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
