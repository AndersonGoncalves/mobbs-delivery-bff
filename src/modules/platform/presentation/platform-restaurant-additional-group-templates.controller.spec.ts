import type { Request, Response, Server } from 'restify';
import { ConflictError, ForbiddenError, NotFoundError } from 'restify-errors';

import { IAdditionalGroupTemplateRepository } from '../../additional-group-templates/domain/repositories/additional-group-template.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { buildPlatformAdminMiddleware } from '../../../shared/http/platform-admin.middleware';
import { PlatformRestaurantAdditionalGroupTemplatesController } from './platform-restaurant-additional-group-templates.controller';

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

function buildTemplate(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 't-1', restaurantId: 'r-1', name: 'Tamanho', type: 'adicionar', required: true,
    minSelections: 1, maxSelections: 1, isActive: true,
    options: [{ id: 'o-1', name: 'Grande', priceDelta: 5 }],
    ...overrides,
  };
}

describe('PlatformRestaurantAdditionalGroupTemplatesController (tela de suporte, pedido explícito do usuário 18/11/2026, 4ª leva)', () => {
  function setup(overrides: {
    templateRepository?: Partial<IAdditionalGroupTemplateRepository>;
    productRepository?: Partial<IProductRepository>;
    allowedEmails?: string[];
  } = {}) {
    const templateRepository: Partial<IAdditionalGroupTemplateRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildTemplate()]),
      create: jest.fn().mockResolvedValue(buildTemplate({ id: 't-2' })),
      update: jest.fn().mockResolvedValue(buildTemplate({ name: 'Tamanho atualizado' })),
      setActive: jest.fn().mockResolvedValue(buildTemplate({ isActive: false })),
      findById: jest.fn().mockResolvedValue(buildTemplate()),
      remove: jest.fn().mockResolvedValue(undefined),
      ...overrides.templateRepository,
    };
    const productRepository: Partial<IProductRepository> = {
      findActiveByTemplateId: jest.fn().mockResolvedValue([]),
      countAnyByTemplateId: jest.fn().mockResolvedValue(0),
      ...overrides.productRepository,
    };
    const platformAdminMiddleware = buildPlatformAdminMiddleware(overrides.allowedEmails ?? ['admin@bsdelivery.com.br']);
    const { application, routes } = buildApp();
    new PlatformRestaurantAdditionalGroupTemplatesController(
      templateRepository as IAdditionalGroupTemplateRepository,
      productRepository as IProductRepository,
      platformAdminMiddleware,
    ).initializeRoutes(application);
    return { templateRepository, productRepository, routes };
  }

  const adminReq = (extra: FakeRequest = {}): FakeRequest => ({
    params: { id: 'r-1' },
    user: { email: 'admin@bsdelivery.com.br' } as Request['user'],
    ...extra,
  });

  const validBody = { name: 'Tamanho', type: 'adicionar', required: true, minSelections: 1, maxSelections: 1, options: [{ name: 'Grande', priceDelta: 5 }] };

  it('rejeita (403) quem não está na lista de e-mails de admin', async () => {
    const { routes } = setup({ allowedEmails: ['outro-admin@bsdelivery.com.br'] });
    await expect(
      runAdminChain(routes['GET /platform/restaurants/:id/additional-group-templates'], adminReq({ query: {} }), { json: jest.fn(), send: jest.fn() }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('GET lista os grupos de adicionais do restaurante informado', async () => {
    const { routes, templateRepository } = setup();
    const json = jest.fn();
    await runAdminChain(routes['GET /platform/restaurants/:id/additional-group-templates'], adminReq({ query: {} }), { json, send: jest.fn() });
    expect(templateRepository.listByRestaurant).toHaveBeenCalledWith('r-1', { name: undefined, isActive: undefined });
    expect(json).toHaveBeenCalledWith(200, [buildTemplate()]);
  });

  it('POST cria um grupo novo pro restaurante informado', async () => {
    const { routes, templateRepository } = setup();
    const json = jest.fn();
    await runAdminChain(routes['POST /platform/restaurants/:id/additional-group-templates'], adminReq({ body: validBody }), { json, send: jest.fn() });
    expect(templateRepository.create).toHaveBeenCalledWith('r-1', expect.objectContaining({ name: 'Tamanho' }));
    expect(json).toHaveBeenCalledWith(201, buildTemplate({ id: 't-2' }));
  });

  it('PUT atualiza um grupo do restaurante informado', async () => {
    const { routes, templateRepository } = setup();
    const json = jest.fn();
    await runAdminChain(
      routes['PUT /platform/restaurants/:id/additional-group-templates/:templateId'],
      adminReq({ params: { id: 'r-1', templateId: 't-1' }, body: { ...validBody, name: 'Tamanho atualizado' } }),
      { json, send: jest.fn() },
    );
    expect(templateRepository.update).toHaveBeenCalledWith('t-1', expect.objectContaining({ name: 'Tamanho atualizado' }));
    expect(json).toHaveBeenCalledWith(200, buildTemplate({ name: 'Tamanho atualizado' }));
  });

  it('PUT rejeita (404) grupo de outro restaurante', async () => {
    const { routes, templateRepository } = setup({ templateRepository: { findById: jest.fn().mockResolvedValue(buildTemplate({ restaurantId: 'r-2' })) } });
    await expect(
      runAdminChain(
        routes['PUT /platform/restaurants/:id/additional-group-templates/:templateId'],
        adminReq({ params: { id: 'r-1', templateId: 't-1' }, body: validBody }),
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(templateRepository.update).not.toHaveBeenCalled();
  });

  it('PATCH /active desativa direto quando não há produto ativo afetado', async () => {
    const { routes, templateRepository } = setup();
    const json = jest.fn();
    await runAdminChain(
      routes['PATCH /platform/restaurants/:id/additional-group-templates/:templateId/active'],
      adminReq({ params: { id: 'r-1', templateId: 't-1' }, body: { isActive: false } }),
      { json, send: jest.fn() },
    );
    expect(templateRepository.setActive).toHaveBeenCalledWith('t-1', false);
    expect(json).toHaveBeenCalledWith(200, buildTemplate({ isActive: false }));
  });

  it('PATCH /active devolve 409 com os produtos afetados sem aplicar nada, sem confirmed', async () => {
    const { routes, templateRepository } = setup({
      productRepository: { findActiveByTemplateId: jest.fn().mockResolvedValue([{ id: 'p-1', name: 'Pizza' }]) },
    });
    const json = jest.fn();
    await runAdminChain(
      routes['PATCH /platform/restaurants/:id/additional-group-templates/:templateId/active'],
      adminReq({ params: { id: 'r-1', templateId: 't-1' }, body: { isActive: false } }),
      { json, send: jest.fn() },
    );
    expect(json).toHaveBeenCalledWith(409, { requiresConfirmation: true, affectedProducts: [{ id: 'p-1', name: 'Pizza' }] });
    expect(templateRepository.setActive).not.toHaveBeenCalled();
  });

  it('DELETE remove um grupo sem uso', async () => {
    const { routes, templateRepository } = setup();
    const send = jest.fn();
    await runAdminChain(
      routes['DELETE /platform/restaurants/:id/additional-group-templates/:templateId'],
      adminReq({ params: { id: 'r-1', templateId: 't-1' } }),
      { json: jest.fn(), send },
    );
    expect(templateRepository.remove).toHaveBeenCalledWith('t-1');
    expect(send).toHaveBeenCalledWith(204);
  });

  it('DELETE rejeita (409) grupo já usado em algum produto', async () => {
    const { routes, templateRepository } = setup({
      productRepository: { countAnyByTemplateId: jest.fn().mockResolvedValue(1) },
    });
    await expect(
      runAdminChain(
        routes['DELETE /platform/restaurants/:id/additional-group-templates/:templateId'],
        adminReq({ params: { id: 'r-1', templateId: 't-1' } }),
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(templateRepository.remove).not.toHaveBeenCalled();
  });

  it('DELETE rejeita (404) grupo de outro restaurante', async () => {
    const { routes, templateRepository } = setup({ templateRepository: { findById: jest.fn().mockResolvedValue(buildTemplate({ restaurantId: 'r-2' })) } });
    await expect(
      runAdminChain(
        routes['DELETE /platform/restaurants/:id/additional-group-templates/:templateId'],
        adminReq({ params: { id: 'r-1', templateId: 't-1' } }),
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(templateRepository.remove).not.toHaveBeenCalled();
  });
});
