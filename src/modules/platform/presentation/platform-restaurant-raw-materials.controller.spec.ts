import type { Request, Response, Server } from 'restify';
import { ForbiddenError, NotFoundError } from 'restify-errors';

import { IRawMaterialRepository } from '../../raw-materials/domain/repositories/raw-material.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { buildPlatformAdminMiddleware } from '../../../shared/http/platform-admin.middleware';
import { PlatformRestaurantRawMaterialsController } from './platform-restaurant-raw-materials.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'query' | 'user'>>;
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => { routes[`GET ${path}`] = handlers; },
    post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; },
    put: (path: string, ...handlers: RouteHandler[]) => { routes[`PUT ${path}`] = handlers; },
    patch: (path: string, ...handlers: RouteHandler[]) => { routes[`PATCH ${path}`] = handlers; },
    del: (path: string, ...handlers: RouteHandler[]) => { routes[`DELETE ${path}`] = handlers; },
  };
  return { application: application as unknown as Server, routes };
}

async function runAdminChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) await handler(req, res);
}

function buildMaterial(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'rm-1', restaurantId: 'r-1', name: 'Bacon', priceDelta: 5, unit: 'kg', isActive: true, currentStock: 10, ...overrides };
}

describe('PlatformRestaurantRawMaterialsController (tela de suporte, pedido explícito do usuário 18/11/2026, 4ª leva)', () => {
  function setup(overrides: {
    rawMaterialRepository?: Partial<IRawMaterialRepository>;
    productRepository?: Partial<IProductRepository>;
    allowedEmails?: string[];
  } = {}) {
    const rawMaterialRepository: Partial<IRawMaterialRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildMaterial()]),
      create: jest.fn().mockResolvedValue(buildMaterial({ id: 'rm-2' })),
      update: jest.fn().mockResolvedValue(buildMaterial({ name: 'Bacon atualizado' })),
      setActive: jest.fn().mockResolvedValue(buildMaterial({ isActive: false })),
      findById: jest.fn().mockResolvedValue(buildMaterial()),
      remove: jest.fn().mockResolvedValue(undefined),
      ...overrides.rawMaterialRepository,
    };
    const productRepository: Partial<IProductRepository> = {
      findActiveByRawMaterialId: jest.fn().mockResolvedValue([]),
      countAnyByRawMaterialId: jest.fn().mockResolvedValue(0),
      ...overrides.productRepository,
    };
    const platformAdminMiddleware = buildPlatformAdminMiddleware(overrides.allowedEmails ?? ['admin@bsdelivery.com.br']);
    const { application, routes } = buildApp();
    new PlatformRestaurantRawMaterialsController(
      rawMaterialRepository as IRawMaterialRepository,
      productRepository as IProductRepository,
      platformAdminMiddleware,
    ).initializeRoutes(application);
    return { rawMaterialRepository, productRepository, routes };
  }

  const adminReq = (extra: FakeRequest = {}): FakeRequest => ({
    params: { id: 'r-1' },
    user: { email: 'admin@bsdelivery.com.br' } as Request['user'],
    ...extra,
  });

  it('rejeita (403) quem não está na lista de e-mails de admin', async () => {
    const { routes } = setup({ allowedEmails: ['outro-admin@bsdelivery.com.br'] });
    await expect(
      runAdminChain(routes['GET /platform/restaurants/:id/raw-materials'], adminReq({ query: {} }), { json: jest.fn(), send: jest.fn() }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('GET lista a matéria-prima do restaurante informado', async () => {
    const { routes, rawMaterialRepository } = setup();
    const json = jest.fn();
    await runAdminChain(routes['GET /platform/restaurants/:id/raw-materials'], adminReq({ query: {} }), { json, send: jest.fn() });
    expect(rawMaterialRepository.listByRestaurant).toHaveBeenCalledWith('r-1', { name: undefined, isActive: undefined });
    expect(json).toHaveBeenCalledWith(200, [buildMaterial()]);
  });

  it('POST cria um item novo pro restaurante informado', async () => {
    const { routes, rawMaterialRepository } = setup();
    const json = jest.fn();
    const body = { name: 'Queijo', priceDelta: 3, unit: 'kg' };
    await runAdminChain(routes['POST /platform/restaurants/:id/raw-materials'], adminReq({ body }), { json, send: jest.fn() });
    expect(rawMaterialRepository.create).toHaveBeenCalledWith('r-1', 'Queijo', 3, 'kg', undefined, undefined, undefined, undefined);
    expect(json).toHaveBeenCalledWith(201, buildMaterial({ id: 'rm-2' }));
  });

  it('PUT atualiza um item do restaurante informado', async () => {
    const { routes, rawMaterialRepository } = setup();
    const json = jest.fn();
    await runAdminChain(
      routes['PUT /platform/restaurants/:id/raw-materials/:materialId'],
      adminReq({ params: { id: 'r-1', materialId: 'rm-1' }, body: { name: 'Bacon atualizado', priceDelta: 5, unit: 'kg' } }),
      { json, send: jest.fn() },
    );
    expect(rawMaterialRepository.update).toHaveBeenCalledWith('rm-1', 'Bacon atualizado', 5, 'kg', undefined, undefined, undefined, undefined);
    expect(json).toHaveBeenCalledWith(200, buildMaterial({ name: 'Bacon atualizado' }));
  });

  it('PUT rejeita (404) item de outro restaurante', async () => {
    const { routes, rawMaterialRepository } = setup({ rawMaterialRepository: { findById: jest.fn().mockResolvedValue(buildMaterial({ restaurantId: 'r-2' })) } });
    await expect(
      runAdminChain(
        routes['PUT /platform/restaurants/:id/raw-materials/:materialId'],
        adminReq({ params: { id: 'r-1', materialId: 'rm-1' }, body: { name: 'x', priceDelta: 1, unit: 'kg' } }),
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(rawMaterialRepository.update).not.toHaveBeenCalled();
  });

  it('PATCH /active desativa direto quando não há produto ativo afetado', async () => {
    const { routes, rawMaterialRepository } = setup();
    const json = jest.fn();
    await runAdminChain(
      routes['PATCH /platform/restaurants/:id/raw-materials/:materialId/active'],
      adminReq({ params: { id: 'r-1', materialId: 'rm-1' }, body: { isActive: false } }),
      { json, send: jest.fn() },
    );
    expect(rawMaterialRepository.setActive).toHaveBeenCalledWith('rm-1', false);
    expect(json).toHaveBeenCalledWith(200, buildMaterial({ isActive: false }));
  });

  it('PATCH /active devolve 409 com os produtos afetados sem aplicar nada, sem confirmed', async () => {
    const { routes, rawMaterialRepository, productRepository } = setup({
      productRepository: { findActiveByRawMaterialId: jest.fn().mockResolvedValue([{ id: 'p-1', name: 'Pizza' }]) },
    });
    const json = jest.fn();
    await runAdminChain(
      routes['PATCH /platform/restaurants/:id/raw-materials/:materialId/active'],
      adminReq({ params: { id: 'r-1', materialId: 'rm-1' }, body: { isActive: false } }),
      { json, send: jest.fn() },
    );
    expect(json).toHaveBeenCalledWith(409, { requiresConfirmation: true, affectedProducts: [{ id: 'p-1', name: 'Pizza' }] });
    expect(rawMaterialRepository.setActive).not.toHaveBeenCalled();
  });

  // Pedido explícito do usuário (19/11/2026) — exclusão real removida desta tela de suporte
  // (controller não registra mais `DELETE /platform/restaurants/:id/raw-materials/:materialId`).
  it('não registra rota de exclusão', async () => {
    const { routes } = setup();
    expect(routes['DELETE /platform/restaurants/:id/raw-materials/:materialId']).toBeUndefined();
  });
});
