import type { Request, Response, Server } from 'restify';

import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IMenuCategoryRepository } from '../domain/repositories/menu-category.repository.interface';
import { IProductRepository } from '../domain/repositories/product.repository.interface';
import { CatalogController } from './catalog.controller';

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

// Pula firebaseAuthMiddleware (primeiro da chain) — tem spec própria
// (shared/http/firebase-auth.middleware.spec.ts).
async function runAuthenticatedChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) {
    await handler(req, res);
  }
}

// Rotas /restaurants/me/... passam por firebaseAuthMiddleware + restaurantOperatorMiddleware —
// pula os dois (cada um tem spec própria) e injeta `req.restaurantId` manualmente, como o
// restaurantOperatorMiddleware real faria.
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(3)) {
    await handler(req, res);
  }
}

function buildCategory() {
  return { id: 'c-1', restaurantId: 'r-1', name: 'Lanches', sortOrder: 0, products: [] };
}

function buildProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p-1',
    restaurantId: 'r-1',
    menuCategoryId: 'c-1',
    name: 'Pizza',
    price: 50,
    isAvailable: true,
    additionalGroups: [],
    ...overrides,
  };
}

describe('CatalogController', () => {
  function setup(
    overrides: {
      menuCategoryRepository?: Partial<IMenuCategoryRepository>;
      productRepository?: Partial<IProductRepository>;
      orderRepository?: Partial<IOrderRepository>;
    } = {},
  ) {
    const menuCategoryRepository: Partial<IMenuCategoryRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildCategory()]),
      create: jest.fn().mockResolvedValue({ id: 'c-2', restaurantId: 'r-1', name: 'Bebidas', sortOrder: 1 }),
      update: jest.fn().mockResolvedValue({ id: 'c-1', restaurantId: 'r-1', name: 'Lanches renomeado', sortOrder: 0 }),
      reorder: jest.fn().mockResolvedValue([buildCategory()]),
      findById: jest.fn().mockResolvedValue({ id: 'c-1', restaurantId: 'r-1', name: 'Lanches', sortOrder: 0 }),
      ...overrides.menuCategoryRepository,
    };
    const productRepository: Partial<IProductRepository> = {
      findById: jest.fn().mockResolvedValue(buildProduct()),
      listByRestaurant: jest.fn().mockResolvedValue([buildProduct()]),
      create: jest.fn().mockResolvedValue(buildProduct({ id: 'p-2' })),
      update: jest.fn().mockResolvedValue(buildProduct({ name: 'Pizza atualizada' })),
      setAvailable: jest.fn().mockResolvedValue(buildProduct({ isAvailable: false })),
      remove: jest.fn().mockResolvedValue(undefined),
      ...overrides.productRepository,
    };
    const orderRepository: Partial<IOrderRepository> = {
      countByProduct: jest.fn().mockResolvedValue(0),
      ...overrides.orderRepository,
    };
    const restaurantOperatorMiddleware = jest.fn(async () => {});
    const { application, routes } = buildFakeApplication();
    new CatalogController(
      menuCategoryRepository as IMenuCategoryRepository,
      productRepository as IProductRepository,
      restaurantOperatorMiddleware,
      orderRepository as IOrderRepository,
    ).initializeRoutes(application);
    return { menuCategoryRepository, productRepository, orderRepository, routes };
  }

  it('AC-1: GET /restaurants/:id/menu-categories retorna as categorias do restaurante', async () => {
    const { menuCategoryRepository, routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /restaurants/:id/menu-categories'], { params: { id: 'r-1' } }, { json });

    expect(menuCategoryRepository.listByRestaurant).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ id: 'c-1' })]);
  });

  it('AC-3: GET /products/:id retorna o produto completo', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /products/:id'], { params: { id: 'p-1' } }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ id: 'p-1' }));
  });

  it('lança 404 quando o produto não existe', async () => {
    const { routes } = setup({ productRepository: { findById: jest.fn().mockResolvedValue(null) } });

    await expect(
      runAuthenticatedChain(routes['GET /products/:id'], { params: { id: 'inexistente' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-1: GET /restaurants/me/menu-categories usa o restaurantId do operador (token), não da rota', async () => {
    const { menuCategoryRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/menu-categories'], { restaurantId: 'r-1' }, { json });

    expect(menuCategoryRepository.listByRestaurant).toHaveBeenCalledWith('r-1');
  });

  it('AC-1: POST /restaurants/me/menu-categories cria categoria no restaurante do operador', async () => {
    const { menuCategoryRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/menu-categories'],
      { restaurantId: 'r-1', body: { name: 'Bebidas' } },
      { json },
    );

    expect(menuCategoryRepository.create).toHaveBeenCalledWith('r-1', 'Bebidas');
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ name: 'Bebidas' }));
  });

  it('PUT /restaurants/me/menu-categories/:id lança 404 se a categoria é de outro restaurante', async () => {
    const { routes } = setup({
      menuCategoryRepository: {
        findById: jest.fn().mockResolvedValue({ id: 'c-1', restaurantId: 'r-OUTRO', name: 'Lanches', sortOrder: 0 }),
      },
    });

    await expect(
      runOperatorChain(
        routes['PUT /restaurants/me/menu-categories/:id'],
        { restaurantId: 'r-1', params: { id: 'c-1' }, body: { name: 'Novo nome' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-1: PUT /restaurants/me/menu-categories/reorder reordena as categorias do restaurante', async () => {
    const { menuCategoryRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PUT /restaurants/me/menu-categories/reorder'],
      { restaurantId: 'r-1', body: { orderedIds: ['c-2', 'c-1'] } },
      { json },
    );

    expect(menuCategoryRepository.reorder).toHaveBeenCalledWith('r-1', ['c-2', 'c-1']);
  });

  it('AC-2: POST /restaurants/me/products cria produto com additionalGroups no restaurante do operador', async () => {
    const { productRepository, routes } = setup();
    const json = jest.fn();
    const body = {
      menuCategoryId: 'c-1',
      name: 'Pizza',
      price: 50,
      isAvailable: true,
      additionalGroups: [
        {
          id: 'g-1',
          productId: 'p-2',
          name: 'Sabor',
          required: true,
          minSelections: 1,
          maxSelections: 1,
          options: [{ id: 'o-1', groupId: 'g-1', name: 'Calabresa', priceDelta: 0 }],
        },
      ],
    };

    await runOperatorChain(routes['POST /restaurants/me/products'], { restaurantId: 'r-1', body }, { json });

    expect(productRepository.create).toHaveBeenCalledWith('r-1', expect.objectContaining({ name: 'Pizza' }));
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'p-2' }));
  });

  it('AC-4: POST /restaurants/me/products rejeita produto sem preço', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/products'],
        { restaurantId: 'r-1', body: { menuCategoryId: 'c-1', name: 'Pizza' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('PUT /restaurants/me/products/:id lança 404 se o produto é de outro restaurante', async () => {
    const { routes } = setup({
      productRepository: { findById: jest.fn().mockResolvedValue(buildProduct({ restaurantId: 'r-OUTRO' })) },
    });

    await expect(
      runOperatorChain(
        routes['PUT /restaurants/me/products/:id'],
        { restaurantId: 'r-1', params: { id: 'p-1' }, body: { name: 'Novo nome' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-3: PATCH /restaurants/me/products/:id/available marca produto indisponível', async () => {
    const { productRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['PATCH /restaurants/me/products/:id/available'],
      { restaurantId: 'r-1', params: { id: 'p-1' }, body: { isAvailable: false } },
      { json },
    );

    expect(productRepository.setAvailable).toHaveBeenCalledWith('p-1', false);
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ isAvailable: false }));
  });

  // specs/0025-adicionais-reutilizaveis-remocao
  it('AC-2: POST /restaurants/me/products aceita um grupo vinculado a um template (referência mínima)', async () => {
    const { productRepository, routes } = setup();
    const json = jest.fn();
    const body = {
      menuCategoryId: 'c-1',
      name: 'Pizza',
      price: 50,
      isAvailable: true,
      additionalGroups: [{ id: 'g-1', productId: 'p-2', templateId: 'tpl-1' }],
    };

    await runOperatorChain(routes['POST /restaurants/me/products'], { restaurantId: 'r-1', body }, { json });

    expect(productRepository.create).toHaveBeenCalledWith(
      'r-1',
      expect.objectContaining({ additionalGroups: [{ id: 'g-1', productId: 'p-2', templateId: 'tpl-1' }] }),
    );
  });

  // Bug real reportado rodando a retaguarda de verdade: `AdditionalGroupBuilder.tsx` manda
  // `templateId` JUNTO com os campos resolvidos (nome/opções/etc — pro preview antes de salvar),
  // não só a referência mínima. Isso derrubava o vínculo no primeiro "Salvar" — o zod caía no
  // schema inline (que não conhece `templateId`) e descartava esse campo.
  it('PUT /restaurants/me/products/:id preserva templateId mesmo quando o payload também traz os campos resolvidos', async () => {
    const { productRepository, routes } = setup();
    const json = jest.fn();
    const body = {
      additionalGroups: [
        {
          id: 'g-1',
          productId: 'p-1',
          templateId: 'tpl-1',
          name: 'Bordas',
          type: 'adicionar',
          required: true,
          minSelections: 1,
          maxSelections: 1,
          options: [{ id: 'o-1', groupId: 'g-1', name: 'Borda Catupiry', priceDelta: 8 }],
        },
      ],
    };

    await runOperatorChain(routes['PUT /restaurants/me/products/:id'], { restaurantId: 'r-1', params: { id: 'p-1' }, body }, { json });

    expect(productRepository.update).toHaveBeenCalledWith(
      'p-1',
      expect.objectContaining({
        additionalGroups: [expect.objectContaining({ id: 'g-1', productId: 'p-1', templateId: 'tpl-1' })],
      }),
    );
  });

  it('AC-9: POST /restaurants/me/products rejeita grupo inline "remover" com priceDelta diferente de 0', async () => {
    const { routes } = setup();
    const body = {
      menuCategoryId: 'c-1',
      name: 'McFish Duplo',
      price: 49,
      isAvailable: true,
      additionalGroups: [
        {
          id: 'g-1',
          productId: 'p-2',
          name: 'Deseja remover algum ingrediente?',
          type: 'remover',
          required: false,
          minSelections: 0,
          maxSelections: 4,
          options: [{ id: 'o-1', groupId: 'g-1', name: 'Molho tártaro', priceDelta: 4 }],
        },
      ],
    };

    await expect(
      runOperatorChain(routes['POST /restaurants/me/products'], { restaurantId: 'r-1', body }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('grupo inline sem "type" assume "adicionar" por padrão (retrocompatibilidade)', async () => {
    const { productRepository, routes } = setup();
    const body = {
      menuCategoryId: 'c-1',
      name: 'Pizza',
      price: 50,
      isAvailable: true,
      additionalGroups: [
        {
          id: 'g-1',
          productId: 'p-2',
          name: 'Sabor',
          required: true,
          minSelections: 1,
          maxSelections: 1,
          options: [{ id: 'o-1', groupId: 'g-1', name: 'Calabresa', priceDelta: 0 }],
        },
      ],
    };

    await runOperatorChain(routes['POST /restaurants/me/products'], { restaurantId: 'r-1', body }, { json: jest.fn() });

    expect(productRepository.create).toHaveBeenCalledWith(
      'r-1',
      expect.objectContaining({ additionalGroups: [expect.objectContaining({ type: 'adicionar' })] }),
    );
  });

  // specs/0026-selecao-clonar-excluir-busca-web
  it('REQ-7: GET /restaurants/me/products repassa name/isAvailable da query pro repositório', async () => {
    const { productRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/products'],
      { restaurantId: 'r-1', query: { name: 'piz', isAvailable: 'true' } },
      { json },
    );

    expect(productRepository.listByRestaurant).toHaveBeenCalledWith('r-1', { name: 'piz', isAvailable: true });
  });

  it('AC-3: DELETE /restaurants/me/products/:id sem uso em pedidos exclui de verdade (204)', async () => {
    const { productRepository, routes } = setup();
    const send = jest.fn();

    await runOperatorChain(
      routes['DELETE /restaurants/me/products/:id'],
      { restaurantId: 'r-1', params: { id: 'p-1' } },
      { json: jest.fn(), send },
    );

    expect(productRepository.remove).toHaveBeenCalledWith('p-1');
    expect(send).toHaveBeenCalledWith(204);
  });

  it('AC-4: DELETE /restaurants/me/products/:id bloqueia (409) se já apareceu em algum pedido', async () => {
    const { productRepository, routes } = setup({ orderRepository: { countByProduct: jest.fn().mockResolvedValue(1) } });
    const send = jest.fn();

    await expect(
      runOperatorChain(
        routes['DELETE /restaurants/me/products/:id'],
        { restaurantId: 'r-1', params: { id: 'p-1' } },
        { json: jest.fn(), send },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(productRepository.remove).not.toHaveBeenCalled();
  });

  it('lança 404 ao tentar excluir produto de outro restaurante', async () => {
    const { routes } = setup({
      productRepository: { findById: jest.fn().mockResolvedValue(buildProduct({ restaurantId: 'r-OUTRO' })) },
    });

    await expect(
      runOperatorChain(
        routes['DELETE /restaurants/me/products/:id'],
        { restaurantId: 'r-1', params: { id: 'p-1' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
