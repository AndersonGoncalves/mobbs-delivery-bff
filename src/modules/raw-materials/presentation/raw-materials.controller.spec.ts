import type { Request, Response, Server } from 'restify';

import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { IRawMaterialRepository } from '../domain/repositories/raw-material.repository.interface';
import { RawMaterialsController } from './raw-materials.controller';

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
  for (const handler of handlers.slice(2)) {
    await handler(req, res);
  }
}

function buildMaterial(overrides: Record<string, unknown> = {}) {
  return { id: 'rm-1', restaurantId: 'r-1', name: 'Bacon', priceDelta: 5, isActive: true, ...overrides };
}

describe('RawMaterialsController', () => {
  function setup(overrides: { rawMaterialRepository?: Partial<IRawMaterialRepository>; productRepository?: Partial<IProductRepository> } = {}) {
    const rawMaterialRepository: Partial<IRawMaterialRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildMaterial()]),
      create: jest.fn().mockResolvedValue(buildMaterial({ id: 'rm-2', name: 'Catupiry' })),
      update: jest.fn().mockResolvedValue(buildMaterial({ name: 'Bacon fatiado' })),
      setActive: jest.fn().mockResolvedValue(buildMaterial({ isActive: false })),
      findById: jest.fn().mockResolvedValue(buildMaterial()),
      ...overrides.rawMaterialRepository,
    };
    const productRepository: Partial<IProductRepository> = {
      findActiveByRawMaterialId: jest.fn().mockResolvedValue([]),
      ...overrides.productRepository,
    };
    const restaurantOperatorMiddleware = jest.fn(async () => {});
    const { application, routes } = buildFakeApplication();
    new RawMaterialsController(
      rawMaterialRepository as IRawMaterialRepository,
      productRepository as IProductRepository,
      restaurantOperatorMiddleware,
    ).initializeRoutes(application);
    return { rawMaterialRepository, productRepository, routes };
  }

  it('AC-5: GET /restaurants/me/raw-materials lista o catálogo do restaurante do operador', async () => {
    const { rawMaterialRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/raw-materials'], { restaurantId: 'r-1' }, { json });

    expect(rawMaterialRepository.listByRestaurant).toHaveBeenCalledWith('r-1');
  });

  it('AC-5: POST /restaurants/me/raw-materials cria um novo item disponível pra vincular', async () => {
    const { rawMaterialRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/raw-materials'],
      { restaurantId: 'r-1', body: { name: 'Catupiry', priceDelta: 4 } },
      { json },
    );

    expect(rawMaterialRepository.create).toHaveBeenCalledWith('r-1', 'Catupiry', 4);
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ name: 'Catupiry' }));
  });

  it('AC-7: PATCH .../active pra desativar sem produtos afetados aplica direto', async () => {
    const { rawMaterialRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/raw-materials/:id/active'],
      { restaurantId: 'r-1', params: { id: 'rm-1' }, body: { isActive: false } },
      { json },
    );

    expect(rawMaterialRepository.setActive).toHaveBeenCalledWith('rm-1', false);
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ isActive: false }));
  });

  it('AC-7: PATCH .../active pra desativar com produtos afetados retorna aviso sem aplicar', async () => {
    const { rawMaterialRepository, routes } = setup({
      productRepository: {
        findActiveByRawMaterialId: jest.fn().mockResolvedValue([{ id: 'p-1', name: 'Pizza de Calabresa' }]),
      },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/raw-materials/:id/active'],
      { restaurantId: 'r-1', params: { id: 'rm-1' }, body: { isActive: false } },
      { json },
    );

    expect(rawMaterialRepository.setActive).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(
      409,
      expect.objectContaining({ requiresConfirmation: true, affectedProducts: [{ id: 'p-1', name: 'Pizza de Calabresa' }] }),
    );
  });

  it('AC-7: PATCH .../active com confirmed:true desativa mesmo com produtos afetados', async () => {
    const { rawMaterialRepository, productRepository, routes } = setup({
      productRepository: {
        findActiveByRawMaterialId: jest.fn().mockResolvedValue([{ id: 'p-1', name: 'Pizza de Calabresa' }]),
      },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/raw-materials/:id/active'],
      { restaurantId: 'r-1', params: { id: 'rm-1' }, body: { isActive: false, confirmed: true } },
      { json },
    );

    expect(productRepository.findActiveByRawMaterialId).not.toHaveBeenCalled();
    expect(rawMaterialRepository.setActive).toHaveBeenCalledWith('rm-1', false);
  });

  it('PATCH .../active pra ativar nunca verifica produtos afetados', async () => {
    const { rawMaterialRepository, productRepository, routes } = setup({
      rawMaterialRepository: { findById: jest.fn().mockResolvedValue(buildMaterial({ isActive: false })) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/raw-materials/:id/active'],
      { restaurantId: 'r-1', params: { id: 'rm-1' }, body: { isActive: true } },
      { json },
    );

    expect(productRepository.findActiveByRawMaterialId).not.toHaveBeenCalled();
    expect(rawMaterialRepository.setActive).toHaveBeenCalledWith('rm-1', true);
  });

  it('lança 404 quando a matéria-prima é de outro restaurante', async () => {
    const { routes } = setup({
      rawMaterialRepository: { findById: jest.fn().mockResolvedValue(buildMaterial({ restaurantId: 'r-OUTRO' })) },
    });

    await expect(
      runOperatorChain(
        routes['PUT /restaurants/me/raw-materials/:id'],
        { restaurantId: 'r-1', params: { id: 'rm-1' }, body: { name: 'X', priceDelta: 1 } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
