import type { Request, Response, Server } from 'restify';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { AutoPrintController } from './auto-print.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { restaurantId?: string };
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => { routes[`GET ${path}`] = handlers; },
    post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; },
  };
  return { application: application as unknown as Server, routes };
}

// Rota do bridge: só 1 middleware (`printApiKeyMiddleware`) antes do handler.
async function runBridgeChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse) {
  for (const handler of handlers.slice(1)) await handler(req, res);
}

// Rota do operador: [firebaseAuthMiddleware, restaurantOperatorMiddleware, requireOperatorRole, handler].
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse) {
  for (const handler of handlers.slice(3)) await handler(req, res);
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o-1', orderNumber: 38, customerId: 'c-1', restaurantId: 'r-1', items: [], orderType: 'pickup',
    status: 'confirmado', statusHistory: [], subtotal: 0, deliveryFee: 0, discount: 0, total: 0,
    paymentMethod: 'cash', createdAt: '2026-10-13T12:00:00.000Z', ...overrides,
  };
}

function buildRestaurant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r-1', name: 'Prime Pizza', autoPrintEnabled: true, autoPrintIntervalSeconds: 10, autoPrintApiKey: 'key-1',
    ...overrides,
  };
}

describe('AutoPrintController', () => {
  function setup(overrides: {
    orderRepository?: Partial<IOrderRepository>;
    restaurantRepository?: Partial<IRestaurantRepository>;
    customerRepository?: Partial<ICustomerRepository>;
  } = {}) {
    const orderRepository: Partial<IOrderRepository> = {
      findPendingAutoPrint: jest.fn().mockResolvedValue([buildOrder()]),
      markAutoPrinted: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue(buildOrder()),
      ...overrides.orderRepository,
    };
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue(buildRestaurant()),
      regenerateAutoPrintApiKey: jest.fn().mockResolvedValue(buildRestaurant({ autoPrintApiKey: 'new-key' })),
      ...overrides.restaurantRepository,
    };
    const customerRepository: Partial<ICustomerRepository> = {
      findById: jest.fn().mockResolvedValue({ id: 'c-1', name: 'Michelle', email: 'm@x.com', phone: '5585984224877' }),
      ...overrides.customerRepository,
    };
    const { application, routes } = buildApp();
    new AutoPrintController(
      orderRepository as IOrderRepository,
      restaurantRepository as IRestaurantRepository,
      customerRepository as ICustomerRepository,
      jest.fn(),
      jest.fn(),
    ).initializeRoutes(application);
    return { orderRepository, restaurantRepository, customerRepository, routes };
  }

  it('GET .../print-queue/pending devolve os pedidos formatados e o intervalo de consulta', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runBridgeChain(routes['GET /restaurants/me/print-queue/pending'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

    expect(orderRepository.findPendingAutoPrint).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
      pollIntervalSeconds: 10,
      orders: [expect.objectContaining({ orderId: 'o-1', lines: expect.any(Array) })],
    }));
  });

  it('GET .../print-queue/pending sem pedidos pendentes devolve lista vazia', async () => {
    const { routes } = setup({ orderRepository: { findPendingAutoPrint: jest.fn().mockResolvedValue([]) } });
    const json = jest.fn();

    await runBridgeChain(routes['GET /restaurants/me/print-queue/pending'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ orders: [] }));
  });

  it('specs/0143 T004: com autoPrintEnabled desligado, devolve lista vazia sem consultar a fila', async () => {
    const { orderRepository, routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ autoPrintEnabled: false })) } });
    const json = jest.fn();

    await runBridgeChain(routes['GET /restaurants/me/print-queue/pending'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

    expect(orderRepository.findPendingAutoPrint).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, { pollIntervalSeconds: 10, orders: [] });
  });

  it('POST .../print-queue/:orderId/printed marca como impresso (idempotente)', async () => {
    const { orderRepository, routes } = setup();
    const send = jest.fn();

    await runBridgeChain(
      routes['POST /restaurants/me/print-queue/:orderId/printed'],
      { restaurantId: 'r-1', params: { orderId: 'o-1' } },
      { json: jest.fn(), send },
    );

    expect(orderRepository.markAutoPrinted).toHaveBeenCalledWith('o-1', 'r-1');
    expect(send).toHaveBeenCalledWith(204);
  });

  it('POST .../auto-print/regenerate-key gera e devolve a nova chave', async () => {
    const { restaurantRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['POST /restaurants/me/auto-print/regenerate-key'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

    expect(restaurantRepository.regenerateAutoPrintApiKey).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, { autoPrintApiKey: 'new-key' });
  });

  describe('GET .../orders/:orderId/receipt-lines (specs/0147-impressao-manual-direta-bridge)', () => {
    it('AC-1: devolve as linhas do recibo pro pedido (delivery/pickup)', async () => {
      const { routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ orderType: 'pickup' })) } });
      const json = jest.fn();

      await runOperatorChain(
        routes['GET /restaurants/me/orders/:orderId/receipt-lines'],
        { restaurantId: 'r-1', params: { orderId: 'o-1' } },
        { json, send: jest.fn() },
      );

      expect(json).toHaveBeenCalledWith(200, { lines: expect.any(Array) });
    });

    it('AC-1: 422 pra pedido de mesa/balcão', async () => {
      const { routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ orderType: 'table' })) } });

      await expect(
        runOperatorChain(
          routes['GET /restaurants/me/orders/:orderId/receipt-lines'],
          { restaurantId: 'r-1', params: { orderId: 'o-1' } },
          { json: jest.fn(), send: jest.fn() },
        ),
      ).rejects.toThrow();
    });

    it('AC-1: 404 quando o pedido não existe', async () => {
      const { routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(null) } });

      await expect(
        runOperatorChain(
          routes['GET /restaurants/me/orders/:orderId/receipt-lines'],
          { restaurantId: 'r-1', params: { orderId: 'inexistente' } },
          { json: jest.fn(), send: jest.fn() },
        ),
      ).rejects.toThrow();
    });

    it('AC-1: 404 quando o pedido é de outro restaurante', async () => {
      const { routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ restaurantId: 'outro-restaurante' })) } });

      await expect(
        runOperatorChain(
          routes['GET /restaurants/me/orders/:orderId/receipt-lines'],
          { restaurantId: 'r-1', params: { orderId: 'o-1' } },
          { json: jest.fn(), send: jest.fn() },
        ),
      ).rejects.toThrow();
    });
  });
});
