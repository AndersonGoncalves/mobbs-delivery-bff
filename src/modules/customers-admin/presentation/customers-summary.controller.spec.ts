import type { Request, Response, Server } from 'restify';

import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { ICustomerSummaryRepository } from '../domain/repositories/customer-summary.repository.interface';
import { CustomersSummaryController } from './customers-summary.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'query'>> & { restaurantId?: string };
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => {
      routes[`GET ${path}`] = handlers;
    },
  };
  return { application: application as unknown as Server, routes };
}

async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(2)) {
    await handler(req, res);
  }
}

function buildSummary(overrides: Record<string, unknown> = {}) {
  return {
    customerId: 'cust-1',
    name: 'Maria Silva',
    phone: '11999990000',
    totalOrders: 3,
    totalSpent: 150.5,
    lastOrderAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  };
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ord-1',
    orderNumber: 1,
    trackingToken: 'tok-1',
    customerId: 'cust-1',
    restaurantId: 'r-1',
    items: [],
    orderType: 'delivery',
    status: 'entregue',
    statusHistory: [],
    subtotal: 100,
    deliveryFee: 0,
    discount: 0,
    total: 100,
    paymentMethod: 'pix',
    createdAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('CustomersSummaryController (specs/0016-clientes-retaguarda)', () => {
  function setup(
    overrides: {
      customerSummaryRepository?: Partial<ICustomerSummaryRepository>;
      orderRepository?: Partial<IOrderRepository>;
    } = {},
  ) {
    const customerSummaryRepository: Partial<ICustomerSummaryRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildSummary()]),
      ...overrides.customerSummaryRepository,
    };
    const orderRepository: Partial<IOrderRepository> = {
      findManyByCustomerAndRestaurant: jest.fn().mockResolvedValue([buildOrder()]),
      ...overrides.orderRepository,
    };
    const restaurantOperatorMiddleware = jest.fn(async () => {});
    const { application, routes } = buildFakeApplication();
    new CustomersSummaryController(
      customerSummaryRepository as ICustomerSummaryRepository,
      orderRepository as IOrderRepository,
      restaurantOperatorMiddleware,
    ).initializeRoutes(application);
    return { customerSummaryRepository, orderRepository, routes };
  }

  it('AC-1: GET /restaurants/me/customers-summary lista os clientes do restaurante do operador', async () => {
    const { customerSummaryRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/customers-summary'], { restaurantId: 'r-1', query: {} }, { json });

    expect(customerSummaryRepository.listByRestaurant).toHaveBeenCalledWith('r-1', undefined);
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ customerId: 'cust-1', totalOrders: 3, totalSpent: 150.5 })]);
  });

  it('AC-2: GET .../customers-summary?search= repassa o termo de busca pro repositório', async () => {
    const { customerSummaryRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/customers-summary'],
      { restaurantId: 'r-1', query: { search: 'Maria' } },
      { json },
    );

    expect(customerSummaryRepository.listByRestaurant).toHaveBeenCalledWith('r-1', 'Maria');
  });

  it('AC-4: repositório é a fonte da ordenação padrão (decrescente por total gasto) — o controller só repassa a lista', async () => {
    const { routes } = setup({
      customerSummaryRepository: {
        listByRestaurant: jest.fn().mockResolvedValue([
          buildSummary({ customerId: 'cust-1', totalSpent: 300 }),
          buildSummary({ customerId: 'cust-2', totalSpent: 100 }),
        ]),
      },
    });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/customers-summary'], { restaurantId: 'r-1', query: {} }, { json });

    const [, body] = json.mock.calls[0];
    expect(body.map((item: { customerId: string }) => item.customerId)).toEqual(['cust-1', 'cust-2']);
  });

  it('AC-3: GET .../customers-summary/:customerId/orders busca o histórico escopado ao restaurante do operador', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/customers-summary/:customerId/orders'],
      { restaurantId: 'r-1', params: { customerId: 'cust-1' } },
      { json },
    );

    expect(orderRepository.findManyByCustomerAndRestaurant).toHaveBeenCalledWith('cust-1', 'r-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'ord-1', restaurantId: 'r-1' })]);
  });
});
