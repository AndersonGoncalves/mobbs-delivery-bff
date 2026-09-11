import type { Request, Response, Server } from 'restify';

import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { IRawMaterialRepository } from '../domain/repositories/raw-material.repository.interface';
import { IStockMovementRepository } from '../domain/repositories/stock-movement.repository.interface';
import { RawMaterialsController } from './raw-materials.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'query'>> & { restaurantId?: string; user?: { uid: string } };
type FakeResponse = Pick<Response, 'json'> & Partial<Pick<Response, 'send'>>;
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
    del: (path: string, ...handlers: RouteHandler[]) => {
      routes[`DELETE ${path}`] = handlers;
    },
  };
  return { application: application as unknown as Server, routes };
}

async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(3)) {
    await handler(req, res);
  }
}

function buildMaterial(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rm-1',
    restaurantId: 'r-1',
    name: 'Bacon',
    priceDelta: 5,
    isActive: true,
    unit: 'kg',
    currentStock: 10,
    minimumStockAlert: 2,
    ...overrides,
  };
}

function buildMovement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mv-1',
    restaurantId: 'r-1',
    rawMaterialId: 'rm-1',
    type: 'entrada',
    quantity: 5,
    reason: 'Ajuste de inventário',
    createdAt: '2026-09-09T10:00:00.000Z',
    ...overrides,
  };
}

describe('RawMaterialsController', () => {
  function setup(
    overrides: {
      rawMaterialRepository?: Partial<IRawMaterialRepository>;
      productRepository?: Partial<IProductRepository>;
      stockMovementRepository?: Partial<IStockMovementRepository>;
    } = {},
  ) {
    const rawMaterialRepository: Partial<IRawMaterialRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildMaterial()]),
      create: jest.fn().mockResolvedValue(buildMaterial({ id: 'rm-2', name: 'Catupiry' })),
      update: jest.fn().mockResolvedValue(buildMaterial({ name: 'Bacon fatiado' })),
      setActive: jest.fn().mockResolvedValue(buildMaterial({ isActive: false })),
      findById: jest.fn().mockResolvedValue(buildMaterial()),
      incrementStock: jest.fn().mockResolvedValue(buildMaterial({ currentStock: 15 })),
      remove: jest.fn().mockResolvedValue(undefined),
      ...overrides.rawMaterialRepository,
    };
    const productRepository: Partial<IProductRepository> = {
      findActiveByRawMaterialId: jest.fn().mockResolvedValue([]),
      countAnyByRawMaterialId: jest.fn().mockResolvedValue(0),
      ...overrides.productRepository,
    };
    const stockMovementRepository: Partial<IStockMovementRepository> = {
      create: jest.fn().mockResolvedValue(buildMovement()),
      listByRawMaterial: jest.fn().mockResolvedValue([buildMovement()]),
      ...overrides.stockMovementRepository,
    };
    const restaurantOperatorMiddleware = jest.fn(async () => {});
    const { application, routes } = buildFakeApplication();
    new RawMaterialsController(
      rawMaterialRepository as IRawMaterialRepository,
      productRepository as IProductRepository,
      restaurantOperatorMiddleware,
      stockMovementRepository as IStockMovementRepository,
    ).initializeRoutes(application);
    return { rawMaterialRepository, productRepository, stockMovementRepository, routes };
  }

  it('AC-5: GET /restaurants/me/raw-materials lista o catálogo do restaurante do operador', async () => {
    const { rawMaterialRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/raw-materials'], { restaurantId: 'r-1' }, { json });

    expect(rawMaterialRepository.listByRestaurant).toHaveBeenCalledWith('r-1', { name: undefined, isActive: undefined });
  });

  it('AC-5: POST /restaurants/me/raw-materials cria um novo item disponível pra vincular', async () => {
    const { rawMaterialRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/raw-materials'],
      { restaurantId: 'r-1', body: { name: 'Catupiry', priceDelta: 4, unit: 'kg' } },
      { json },
    );

    expect(rawMaterialRepository.create).toHaveBeenCalledWith('r-1', 'Catupiry', 4, 'kg', undefined);
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ name: 'Catupiry' }));
  });

  it('rejeita criação sem unidade de medida', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/raw-materials'],
        { restaurantId: 'r-1', body: { name: 'Catupiry', priceDelta: 4 } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
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
        { restaurantId: 'r-1', params: { id: 'rm-1' }, body: { name: 'X', priceDelta: 1, unit: 'kg' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // specs/0015-estoque-compras
  it('AC-5: POST .../stock-adjustment de saída reduz o estoque e registra o motivo', async () => {
    const { rawMaterialRepository, stockMovementRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/raw-materials/:id/stock-adjustment'],
      {
        restaurantId: 'r-1',
        params: { id: 'rm-1' },
        body: { type: 'saida', quantity: 3, reason: 'Perda por validade' },
        user: { uid: 'op-1' },
      },
      { json },
    );

    expect(rawMaterialRepository.incrementStock).toHaveBeenCalledWith('rm-1', -3);
    expect(stockMovementRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId: 'r-1',
        rawMaterialId: 'rm-1',
        type: 'saida',
        quantity: 3,
        reason: 'Perda por validade',
        createdBy: 'op-1',
      }),
    );
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ rawMaterial: expect.anything(), movement: expect.anything() }));
  });

  it('AC-5: POST .../stock-adjustment de entrada soma ao estoque', async () => {
    const { rawMaterialRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/raw-materials/:id/stock-adjustment'],
      { restaurantId: 'r-1', params: { id: 'rm-1' }, body: { type: 'entrada', quantity: 8, reason: 'Inventário' } },
      { json },
    );

    expect(rawMaterialRepository.incrementStock).toHaveBeenCalledWith('rm-1', 8);
  });

  it('rejeita ajuste manual sem motivo', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/raw-materials/:id/stock-adjustment'],
        { restaurantId: 'r-1', params: { id: 'rm-1' }, body: { type: 'saida', quantity: 3 } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('AC-6: GET .../movements lista o histórico em ordem cronológica', async () => {
    const { stockMovementRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/raw-materials/:id/movements'],
      { restaurantId: 'r-1', params: { id: 'rm-1' } },
      { json },
    );

    expect(stockMovementRepository.listByRawMaterial).toHaveBeenCalledWith('rm-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'mv-1' })]);
  });

  it('lança 404 ao consultar movimentações de matéria-prima de outro restaurante', async () => {
    const { routes } = setup({
      rawMaterialRepository: { findById: jest.fn().mockResolvedValue(buildMaterial({ restaurantId: 'r-OUTRO' })) },
    });

    await expect(
      runOperatorChain(
        routes['GET /restaurants/me/raw-materials/:id/movements'],
        { restaurantId: 'r-1', params: { id: 'rm-1' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // specs/0026-selecao-clonar-excluir-busca-web
  it('REQ-7: GET /restaurants/me/raw-materials repassa name/isActive da query pro repositório', async () => {
    const { rawMaterialRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/raw-materials'],
      { restaurantId: 'r-1', query: { name: 'bac', isActive: 'false' } },
      { json },
    );

    expect(rawMaterialRepository.listByRestaurant).toHaveBeenCalledWith('r-1', { name: 'bac', isActive: false });
  });

  it('AC-3: DELETE /restaurants/me/raw-materials/:id sem uso em produto exclui de verdade (204)', async () => {
    const { rawMaterialRepository, routes } = setup();
    const send = jest.fn();

    await runOperatorChain(
      routes['DELETE /restaurants/me/raw-materials/:id'],
      { restaurantId: 'r-1', params: { id: 'rm-1' } },
      { json: jest.fn(), send },
    );

    expect(rawMaterialRepository.remove).toHaveBeenCalledWith('rm-1');
    expect(send).toHaveBeenCalledWith(204);
  });

  it('AC-5: DELETE /restaurants/me/raw-materials/:id bloqueia (409) mesmo se o produto que usa está indisponível', async () => {
    const { rawMaterialRepository, routes } = setup({
      productRepository: { countAnyByRawMaterialId: jest.fn().mockResolvedValue(1) },
    });
    const send = jest.fn();

    await expect(
      runOperatorChain(
        routes['DELETE /restaurants/me/raw-materials/:id'],
        { restaurantId: 'r-1', params: { id: 'rm-1' } },
        { json: jest.fn(), send },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(rawMaterialRepository.remove).not.toHaveBeenCalled();
  });
});
