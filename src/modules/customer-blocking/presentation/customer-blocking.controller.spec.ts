import type { Request, Response, Server } from 'restify';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IBlockedCustomerRepository } from '../domain/repositories/blocked-customer.repository.interface';
import { CustomerBlockingController } from './customer-blocking.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { restaurantId?: string };
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => { routes[`GET ${path}`] = handlers; },
    post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; },
    del: (path: string, ...handlers: RouteHandler[]) => { routes[`DELETE ${path}`] = handlers; },
  };
  return { application: application as unknown as Server, routes };
}

// A controller monta [firebaseAuthMiddleware, restaurantOperatorMiddleware, requireOperatorRole, handler] —
// os 3 primeiros são middlewares de verdade (não precisam rodar no teste), só o handler importa.
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse) {
  for (const handler of handlers.slice(3)) await handler(req, res);
}

function buildBlocked(overrides: Record<string, unknown> = {}) {
  return { id: 'b-1', restaurantId: 'r-1', phone: '5585984224877', createdAt: '2026-10-13T12:00:00.000Z', ...overrides };
}

describe('CustomerBlockingController', () => {
  function setup(overrides: {
    blockedCustomerRepository?: Partial<IBlockedCustomerRepository>;
    customerRepository?: Partial<ICustomerRepository>;
  } = {}) {
    const blockedCustomerRepository: Partial<IBlockedCustomerRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildBlocked()]),
      block: jest.fn().mockResolvedValue(buildBlocked()),
      unblock: jest.fn().mockResolvedValue(true),
      ...overrides.blockedCustomerRepository,
    };
    const customerRepository: Partial<ICustomerRepository> = {
      findByPhone: jest.fn().mockResolvedValue(null),
      ...overrides.customerRepository,
    };
    const { application, routes } = buildApp();
    new CustomerBlockingController(
      blockedCustomerRepository as IBlockedCustomerRepository,
      customerRepository as ICustomerRepository,
      jest.fn(),
    ).initializeRoutes(application);
    return { blockedCustomerRepository, customerRepository, routes };
  }

  it('GET /restaurants/me/blocked-customers lista os bloqueados do restaurante', async () => {
    const { blockedCustomerRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/blocked-customers'], { restaurantId: 'r-1' }, { json, send: jest.fn() });

    expect(blockedCustomerRepository.listByRestaurant).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [buildBlocked()]);
  });

  it('POST /restaurants/me/blocked-customers normaliza o telefone e resolve o nome do cliente, se existir', async () => {
    const { blockedCustomerRepository, customerRepository, routes } = setup({
      customerRepository: { findByPhone: jest.fn().mockResolvedValue({ id: 'c-1', name: 'Michelle', email: 'm@x.com', phone: '5585984224877' }) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/blocked-customers'],
      { restaurantId: 'r-1', body: { phone: '(85) 98422-4877' } },
      { json, send: jest.fn() },
    );

    expect(customerRepository.findByPhone).toHaveBeenCalledWith('5585984224877');
    expect(blockedCustomerRepository.block).toHaveBeenCalledWith('r-1', '5585984224877', 'Michelle');
    expect(json).toHaveBeenCalledWith(201, buildBlocked());
  });

  it('POST /restaurants/me/blocked-customers funciona sem cliente cadastrado com esse telefone (nome fica undefined)', async () => {
    const { blockedCustomerRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/blocked-customers'],
      { restaurantId: 'r-1', body: { phone: '85984224877' } },
      { json, send: jest.fn() },
    );

    expect(blockedCustomerRepository.block).toHaveBeenCalledWith('r-1', '5585984224877', undefined);
  });

  it('DELETE /restaurants/me/blocked-customers/:id remove o bloqueio', async () => {
    const { blockedCustomerRepository, routes } = setup();
    const send = jest.fn();

    await runOperatorChain(
      routes['DELETE /restaurants/me/blocked-customers/:id'],
      { restaurantId: 'r-1', params: { id: 'b-1' } },
      { json: jest.fn(), send },
    );

    expect(blockedCustomerRepository.unblock).toHaveBeenCalledWith('b-1', 'r-1');
    expect(send).toHaveBeenCalledWith(204);
  });

  it('DELETE em bloqueio inexistente (ou de outro restaurante) devolve 404', async () => {
    const { routes } = setup({ blockedCustomerRepository: { unblock: jest.fn().mockResolvedValue(false) } });

    await expect(
      runOperatorChain(
        routes['DELETE /restaurants/me/blocked-customers/:id'],
        { restaurantId: 'r-1', params: { id: 'b-404' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
