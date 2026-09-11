import type { Request, Response, Server } from 'restify';

import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { IAdditionalGroupTemplateRepository } from '../domain/repositories/additional-group-template.repository.interface';
import { AdditionalGroupTemplatesController } from './additional-group-templates.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'query'>> & { restaurantId?: string };
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

function buildTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agt-1',
    restaurantId: 'r-1',
    name: 'BORDAS',
    type: 'adicionar',
    required: false,
    minSelections: 0,
    maxSelections: 1,
    options: [{ id: 'opt-1', templateId: 'agt-1', name: 'Catupiry', priceDelta: 8 }],
    isActive: true,
    ...overrides,
  };
}

describe('AdditionalGroupTemplatesController', () => {
  function setup(
    overrides: {
      templateRepository?: Partial<IAdditionalGroupTemplateRepository>;
      productRepository?: Partial<IProductRepository>;
    } = {},
  ) {
    const templateRepository: Partial<IAdditionalGroupTemplateRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildTemplate()]),
      create: jest.fn().mockResolvedValue(buildTemplate({ id: 'agt-2', name: 'ACRESCIMOS' })),
      update: jest.fn().mockResolvedValue(buildTemplate({ name: 'BORDAS RECHEADAS' })),
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
    const restaurantOperatorMiddleware = jest.fn(async () => {});
    const { application, routes } = buildFakeApplication();
    new AdditionalGroupTemplatesController(
      templateRepository as IAdditionalGroupTemplateRepository,
      productRepository as IProductRepository,
      restaurantOperatorMiddleware,
    ).initializeRoutes(application);
    return { templateRepository, productRepository, routes };
  }

  it('AC-1: GET /restaurants/me/additional-group-templates lista os templates do restaurante', async () => {
    const { templateRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/additional-group-templates'], { restaurantId: 'r-1' }, { json });

    expect(templateRepository.listByRestaurant).toHaveBeenCalledWith('r-1', { name: undefined, isActive: undefined });
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ name: 'BORDAS' })]);
  });

  it('AC-1: POST /restaurants/me/additional-group-templates cria um template novo', async () => {
    const { templateRepository, routes } = setup();
    const json = jest.fn();
    const payload = { name: 'ACRESCIMOS', type: 'adicionar', required: false, minSelections: 0, maxSelections: 5, options: [] };

    await runOperatorChain(
      routes['POST /restaurants/me/additional-group-templates'],
      { restaurantId: 'r-1', body: payload },
      { json },
    );

    expect(templateRepository.create).toHaveBeenCalledWith('r-1', expect.objectContaining({ name: 'ACRESCIMOS' }));
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ name: 'ACRESCIMOS' }));
  });

  it('AC-9: rejeita criação de template "remover" com opção de preço diferente de 0', async () => {
    const { routes } = setup();
    const payload = {
      name: 'Sem ingrediente',
      type: 'remover',
      required: false,
      minSelections: 0,
      maxSelections: 3,
      options: [{ name: 'Cebola', priceDelta: 2 }],
    };

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/additional-group-templates'],
        { restaurantId: 'r-1', body: payload },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('aceita criação de template "remover" com priceDelta 0 em todas as opções', async () => {
    const { templateRepository, routes } = setup();
    const payload = {
      name: 'Sem ingrediente',
      type: 'remover',
      required: false,
      minSelections: 0,
      maxSelections: 3,
      options: [{ name: 'Cebola', priceDelta: 0 }],
    };

    await runOperatorChain(
      routes['POST /restaurants/me/additional-group-templates'],
      { restaurantId: 'r-1', body: payload },
      { json: jest.fn() },
    );

    expect(templateRepository.create).toHaveBeenCalledWith('r-1', expect.objectContaining({ type: 'remover' }));
  });

  it('AC-4: PATCH .../active pra desativar sem produtos afetados aplica direto', async () => {
    const { templateRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/additional-group-templates/:id/active'],
      { restaurantId: 'r-1', params: { id: 'agt-1' }, body: { isActive: false } },
      { json },
    );

    expect(templateRepository.setActive).toHaveBeenCalledWith('agt-1', false);
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ isActive: false }));
  });

  it('AC-4: PATCH .../active pra desativar com produtos afetados retorna aviso sem aplicar', async () => {
    const { templateRepository, routes } = setup({
      productRepository: { findActiveByTemplateId: jest.fn().mockResolvedValue([{ id: 'p-1', name: 'Pizza Calabresa' }]) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/additional-group-templates/:id/active'],
      { restaurantId: 'r-1', params: { id: 'agt-1' }, body: { isActive: false } },
      { json },
    );

    expect(templateRepository.setActive).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(
      409,
      expect.objectContaining({ requiresConfirmation: true, affectedProducts: [{ id: 'p-1', name: 'Pizza Calabresa' }] }),
    );
  });

  it('AC-4: PATCH .../active com confirmed:true desativa mesmo com produtos afetados', async () => {
    const { templateRepository, productRepository, routes } = setup({
      productRepository: { findActiveByTemplateId: jest.fn().mockResolvedValue([{ id: 'p-1', name: 'Pizza Calabresa' }]) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/additional-group-templates/:id/active'],
      { restaurantId: 'r-1', params: { id: 'agt-1' }, body: { isActive: false, confirmed: true } },
      { json },
    );

    expect(productRepository.findActiveByTemplateId).not.toHaveBeenCalled();
    expect(templateRepository.setActive).toHaveBeenCalledWith('agt-1', false);
  });

  it('lança 404 quando o template é de outro restaurante', async () => {
    const { routes } = setup({
      templateRepository: { findById: jest.fn().mockResolvedValue(buildTemplate({ restaurantId: 'r-OUTRO' })) },
    });

    await expect(
      runOperatorChain(
        routes['PUT /restaurants/me/additional-group-templates/:id'],
        {
          restaurantId: 'r-1',
          params: { id: 'agt-1' },
          body: { name: 'X', type: 'adicionar', required: false, minSelections: 0, maxSelections: 1, options: [] },
        },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // specs/0026-selecao-clonar-excluir-busca-web
  it('REQ-7: GET /restaurants/me/additional-group-templates repassa name/isActive da query', async () => {
    const { templateRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/additional-group-templates'],
      { restaurantId: 'r-1', query: { name: 'bord', isActive: 'true' } },
      { json },
    );

    expect(templateRepository.listByRestaurant).toHaveBeenCalledWith('r-1', { name: 'bord', isActive: true });
  });

  it('AC-3: DELETE .../:id sem uso em produto exclui de verdade (204)', async () => {
    const { templateRepository, routes } = setup();
    const send = jest.fn();

    await runOperatorChain(
      routes['DELETE /restaurants/me/additional-group-templates/:id'],
      { restaurantId: 'r-1', params: { id: 'agt-1' } },
      { json: jest.fn(), send },
    );

    expect(templateRepository.remove).toHaveBeenCalledWith('agt-1');
    expect(send).toHaveBeenCalledWith(204);
  });

  it('AC-5: DELETE .../:id bloqueia (409) mesmo se o produto que usa está indisponível', async () => {
    const { templateRepository, routes } = setup({
      productRepository: { countAnyByTemplateId: jest.fn().mockResolvedValue(1) },
    });
    const send = jest.fn();

    await expect(
      runOperatorChain(
        routes['DELETE /restaurants/me/additional-group-templates/:id'],
        { restaurantId: 'r-1', params: { id: 'agt-1' } },
        { json: jest.fn(), send },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(templateRepository.remove).not.toHaveBeenCalled();
  });
});
