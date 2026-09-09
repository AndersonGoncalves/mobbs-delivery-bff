import type { Request, Response, Server } from 'restify';

import { IMenuCategoryRepository } from '../domain/repositories/menu-category.repository.interface';
import { IProductRepository } from '../domain/repositories/product.repository.interface';
import { CatalogController } from './catalog.controller';

type FakeRequest = Partial<Pick<Request, 'params'>>;
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => {
      routes[`GET ${path}`] = handlers;
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

function buildCategory() {
  return { id: 'c-1', restaurantId: 'r-1', name: 'Lanches', sortOrder: 0, products: [] };
}

function buildProduct() {
  return {
    id: 'p-1',
    restaurantId: 'r-1',
    menuCategoryId: 'c-1',
    name: 'Pizza',
    price: 50,
    isAvailable: true,
    additionalGroups: [],
  };
}

describe('CatalogController', () => {
  function setup(overrides: { menuCategoryRepository?: Partial<IMenuCategoryRepository>; productRepository?: Partial<IProductRepository> } = {}) {
    const menuCategoryRepository: Partial<IMenuCategoryRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildCategory()]),
      ...overrides.menuCategoryRepository,
    };
    const productRepository: Partial<IProductRepository> = {
      findById: jest.fn().mockResolvedValue(buildProduct()),
      ...overrides.productRepository,
    };
    const { application, routes } = buildFakeApplication();
    new CatalogController(
      menuCategoryRepository as IMenuCategoryRepository,
      productRepository as IProductRepository,
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
});
