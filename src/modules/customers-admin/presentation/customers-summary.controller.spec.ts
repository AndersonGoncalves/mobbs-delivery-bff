import type { Request, Response, Server } from 'restify';

import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IAddressRepository } from '../../customers/domain/repositories/address.repository.interface';
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
  for (const handler of handlers.slice(3)) {
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

function buildAddress(overrides: Record<string, unknown> = {}) {
  return {
    id: 'addr-1',
    customerId: 'cust-1',
    label: 'Casa',
    street: 'Rua A',
    number: '123',
    neighborhood: 'Centro',
    city: 'Fortaleza',
    state: 'CE',
    zipCode: '60000000',
    isDefault: true,
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
      addressRepository?: Partial<IAddressRepository>;
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
    const addressRepository: Partial<IAddressRepository> = {
      listByCustomer: jest.fn().mockResolvedValue([buildAddress()]),
      ...overrides.addressRepository,
    };
    const restaurantOperatorMiddleware = jest.fn(async () => {});
    const { application, routes } = buildFakeApplication();
    new CustomersSummaryController(
      customerSummaryRepository as ICustomerSummaryRepository,
      orderRepository as IOrderRepository,
      restaurantOperatorMiddleware,
      addressRepository as IAddressRepository,
    ).initializeRoutes(application);
    return { customerSummaryRepository, orderRepository, addressRepository, routes };
  }

  it('AC-1: GET /restaurants/me/customers-summary lista os clientes do restaurante do operador', async () => {
    const { customerSummaryRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/customers-summary'], { restaurantId: 'r-1', query: {} }, { json });

    expect(customerSummaryRepository.listByRestaurant).toHaveBeenCalledWith('r-1', undefined, undefined, undefined);
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

    expect(customerSummaryRepository.listByRestaurant).toHaveBeenCalledWith('r-1', 'Maria', undefined, undefined);
  });

  // Pedido explícito do usuário (follow-up) — filtro de período pra totalOrders/totalSpent.
  it('GET .../customers-summary?fromDate=&toDate= converte pra Date (início/fim do dia) e repassa pro repositório', async () => {
    const { customerSummaryRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/customers-summary'],
      { restaurantId: 'r-1', query: { fromDate: '2026-09-01', toDate: '2026-09-30' } },
      { json },
    );

    expect(customerSummaryRepository.listByRestaurant).toHaveBeenCalledWith(
      'r-1',
      undefined,
      new Date('2026-09-01T00:00:00.000'),
      new Date('2026-09-30T23:59:59.999'),
    );
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

  // Pedido explícito do usuário (follow-up) — "ver endereços" do cliente, mesmo padrão de "ver
  // pedidos".
  it('GET .../customers-summary/:customerId/addresses devolve os endereços de um cliente que já pediu neste restaurante', async () => {
    const { addressRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/customers-summary/:customerId/addresses'],
      { restaurantId: 'r-1', params: { customerId: 'cust-1' } },
      { json },
    );

    expect(addressRepository.listByCustomer).toHaveBeenCalledWith('cust-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'addr-1', customerId: 'cust-1' })]);
  });

  it('GET .../addresses de um cliente que NUNCA pediu neste restaurante devolve lista vazia, sem consultar os endereços', async () => {
    const { addressRepository, routes } = setup({
      orderRepository: { findManyByCustomerAndRestaurant: jest.fn().mockResolvedValue([]) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/customers-summary/:customerId/addresses'],
      { restaurantId: 'r-1', params: { customerId: 'cust-outro-restaurante' } },
      { json },
    );

    expect(addressRepository.listByCustomer).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, []);
  });
});
