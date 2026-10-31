import type { Request, Response, Server } from 'restify';

import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import { CustomerPaymentMethodsController } from './customer-payment-methods.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { restaurantId?: string };
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    put: (path: string, ...handlers: RouteHandler[]) => { routes[`PUT ${path}`] = handlers; },
  };
  return { application: application as unknown as Server, routes };
}

// A controller monta [firebaseAuthMiddleware, restaurantOperatorMiddleware, requireOperatorRole, handler] —
// os 3 primeiros são middlewares de verdade (não precisam rodar no teste), só o handler importa.
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse) {
  for (const handler of handlers.slice(3)) await handler(req, res);
}

function buildRestaurant(overrides: Partial<IRestaurant> = {}): IRestaurant {
  return {
    acceptedPaymentMethods: ['pix', 'creditCard', 'cash'],
    ...overrides,
  } as IRestaurant;
}

function buildCustomer(overrides: Record<string, unknown> = {}) {
  return { id: 'c-1', name: 'Ana', email: 'ana@example.com', allowedPaymentMethods: ['pix'], ...overrides };
}

describe('CustomerPaymentMethodsController', () => {
  function setup(overrides: {
    customerRepository?: Partial<ICustomerRepository>;
    restaurantRepository?: Partial<IRestaurantRepository>;
    orderRepository?: Partial<IOrderRepository>;
  } = {}) {
    const customerRepository: Partial<ICustomerRepository> = {
      updateAllowedPaymentMethods: jest.fn().mockResolvedValue(buildCustomer()),
      ...overrides.customerRepository,
    };
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue(buildRestaurant()),
      ...overrides.restaurantRepository,
    };
    // Achado crítico da auditoria pré-produção (31/10/2026) — default com 1 pedido (cliente JÁ
    // pediu neste restaurante), pra não quebrar os testes que não se importam com a checagem de
    // posse em si; o teste dedicado abaixo sobrescreve pra `[]`.
    const orderRepository: Partial<IOrderRepository> = {
      findManyByCustomerAndRestaurant: jest.fn().mockResolvedValue([{ id: 'o-1' }]),
      ...overrides.orderRepository,
    };
    const { application, routes } = buildApp();
    new CustomerPaymentMethodsController(
      customerRepository as ICustomerRepository,
      restaurantRepository as IRestaurantRepository,
      orderRepository as IOrderRepository,
      jest.fn(),
    ).initializeRoutes(application);
    return { customerRepository, restaurantRepository, orderRepository, routes };
  }

  it('AC-2/AC-3 — dono/gerente salva um subconjunto válido de acceptedPaymentMethods', async () => {
    const { customerRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PUT /restaurants/me/customers/:customerId/payment-methods'],
      { restaurantId: 'r-1', params: { customerId: 'c-1' }, body: { allowedPaymentMethods: ['pix'] } },
      { json, send: jest.fn() },
    );

    expect(customerRepository.updateAllowedPaymentMethods).toHaveBeenCalledWith('c-1', ['pix']);
    expect(json).toHaveBeenCalledWith(200, buildCustomer());
  });

  it('AC-5 — rejeita (400) um valor fora de acceptedPaymentMethods do restaurante', async () => {
    const { customerRepository, routes } = setup();

    await expect(
      runOperatorChain(
        routes['PUT /restaurants/me/customers/:customerId/payment-methods'],
        { restaurantId: 'r-1', params: { customerId: 'c-1' }, body: { allowedPaymentMethods: ['debitCard'] } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(customerRepository.updateAllowedPaymentMethods).not.toHaveBeenCalled();
  });

  it('REQ-1 — null limpa a restrição própria, sem precisar estar em acceptedPaymentMethods', async () => {
    const { customerRepository, routes } = setup({
      customerRepository: { updateAllowedPaymentMethods: jest.fn().mockResolvedValue(buildCustomer({ allowedPaymentMethods: undefined })) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['PUT /restaurants/me/customers/:customerId/payment-methods'],
      { restaurantId: 'r-1', params: { customerId: 'c-1' }, body: { allowedPaymentMethods: null } },
      { json, send: jest.fn() },
    );

    expect(customerRepository.updateAllowedPaymentMethods).toHaveBeenCalledWith('c-1', null);
  });

  it('404 quando o cliente não existe', async () => {
    const { routes } = setup({
      customerRepository: { updateAllowedPaymentMethods: jest.fn().mockResolvedValue(null) },
    });

    await expect(
      runOperatorChain(
        routes['PUT /restaurants/me/customers/:customerId/payment-methods'],
        { restaurantId: 'r-1', params: { customerId: 'c-404' }, body: { allowedPaymentMethods: ['pix'] } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // Achado crítico da auditoria pré-produção (31/10/2026) — "forma de pagamento de um cliente
  // pode ser alterada sem checar vínculo com o restaurante".
  it('achado de auditoria (2026-10-31): rejeita (404) um customerId que nunca pediu neste restaurante, sem alterar nada', async () => {
    const { customerRepository, orderRepository, routes } = setup({
      orderRepository: { findManyByCustomerAndRestaurant: jest.fn().mockResolvedValue([]) },
    });

    await expect(
      runOperatorChain(
        routes['PUT /restaurants/me/customers/:customerId/payment-methods'],
        { restaurantId: 'r-1', params: { customerId: 'c-outro-restaurante' }, body: { allowedPaymentMethods: ['pix'] } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });

    expect(orderRepository.findManyByCustomerAndRestaurant).toHaveBeenCalledWith('c-outro-restaurante', 'r-1');
    expect(customerRepository.updateAllowedPaymentMethods).not.toHaveBeenCalled();
  });
});
