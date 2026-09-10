import type { Request, Response, Server } from 'restify';

import { ISupplierRepository } from '../domain/repositories/supplier.repository.interface';
import { SuppliersController } from './suppliers.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { restaurantId?: string };
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => {
      routes[`GET ${path}`] = handlers;
    },
    post: (path: string, ...handlers: RouteHandler[]) => {
      routes[`POST ${path}`] = handlers;
    },
    put: (path: string, ...handlers: RouteHandler[]) => {
      routes[`PUT ${path}`] = handlers;
    },
    patch: (path: string, ...handlers: RouteHandler[]) => {
      routes[`PATCH ${path}`] = handlers;
    },
  };
  return { application: application as unknown as Server, routes };
}

async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(3)) {
    await handler(req, res);
  }
}

function buildSupplier(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sup-1',
    restaurantId: 'r-1',
    name: 'Distribuidora ABC',
    document: '12.345.678/0001-00',
    phone: '11999990000',
    email: 'contato@abc.com',
    isActive: true,
    ...overrides,
  };
}

describe('SuppliersController (specs/0015-estoque-compras REQ-1)', () => {
  function setup(overrides: { supplierRepository?: Partial<ISupplierRepository> } = {}) {
    const supplierRepository: Partial<ISupplierRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildSupplier()]),
      findById: jest.fn().mockResolvedValue(buildSupplier()),
      create: jest.fn().mockResolvedValue(buildSupplier()),
      update: jest.fn().mockResolvedValue(buildSupplier({ name: 'Distribuidora ABC Ltda' })),
      setActive: jest.fn().mockResolvedValue(buildSupplier({ isActive: false })),
      ...overrides.supplierRepository,
    };
    const restaurantOperatorMiddleware = jest.fn(async () => {});
    const { application, routes } = buildFakeApplication();
    new SuppliersController(supplierRepository as ISupplierRepository, restaurantOperatorMiddleware).initializeRoutes(application);
    return { supplierRepository, routes };
  }

  it('AC-1: GET /restaurants/me/suppliers lista os fornecedores do restaurante do operador', async () => {
    const { supplierRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/suppliers'], { restaurantId: 'r-1' }, { json });

    expect(supplierRepository.listByRestaurant).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'sup-1' })]);
  });

  it('AC-1: POST /restaurants/me/suppliers cria um fornecedor disponível pra selecionar num pedido de compra', async () => {
    const { supplierRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/suppliers'],
      { restaurantId: 'r-1', body: { name: 'Distribuidora ABC', document: '12.345.678/0001-00' } },
      { json },
    );

    expect(supplierRepository.create).toHaveBeenCalledWith('r-1', expect.objectContaining({ name: 'Distribuidora ABC' }));
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ isActive: true }));
  });

  it('rejeita criação sem nome', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(routes['POST /restaurants/me/suppliers'], { restaurantId: 'r-1', body: {} }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('REQ-1: PUT /restaurants/me/suppliers/:id edita um fornecedor existente', async () => {
    const { supplierRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PUT /restaurants/me/suppliers/:id'],
      { restaurantId: 'r-1', params: { id: 'sup-1' }, body: { name: 'Distribuidora ABC Ltda' } },
      { json },
    );

    expect(supplierRepository.update).toHaveBeenCalledWith('sup-1', expect.objectContaining({ name: 'Distribuidora ABC Ltda' }));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ name: 'Distribuidora ABC Ltda' }));
  });

  it('REQ-1: PATCH .../active desativa um fornecedor', async () => {
    const { supplierRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/suppliers/:id/active'],
      { restaurantId: 'r-1', params: { id: 'sup-1' }, body: { isActive: false } },
      { json },
    );

    expect(supplierRepository.setActive).toHaveBeenCalledWith('sup-1', false);
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ isActive: false }));
  });

  it('lança 404 ao operar sobre um fornecedor de outro restaurante', async () => {
    const { routes } = setup({
      supplierRepository: { findById: jest.fn().mockResolvedValue(buildSupplier({ restaurantId: 'r-OUTRO' })) },
    });

    await expect(
      runOperatorChain(
        routes['PUT /restaurants/me/suppliers/:id'],
        { restaurantId: 'r-1', params: { id: 'sup-1' }, body: { name: 'X' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
