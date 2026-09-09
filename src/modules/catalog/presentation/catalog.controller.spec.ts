import type { Request, Response, Server } from 'restify';

import { IMenuCategoryRepository } from '../domain/repositories/menu-category.repository.interface';
import { IProductRepository } from '../domain/repositories/product.repository.interface';
import { CatalogController } from './catalog.controller';

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
  for (const handler of handlers.slice(2)) {
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
  function setup(overrides: { menuCategoryRepository?: Partial<IMenuCategoryRepository>; productRepository?: Partial<IProductRepository> } = {}) {
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
      ...overrides.productRepository,
    };
    const restaurantOperatorMiddleware = jest.fn(async () => {});
    const { application, routes } = buildFakeApplication();
    new CatalogController(
      menuCategoryRepository as IMenuCategoryRepository,
      productRepository as IProductRepository,
      restaurantOperatorMiddleware,
    ).initializeRoutes(application);
    return { menuCategoryRepository, productRepository, routes };
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
});
