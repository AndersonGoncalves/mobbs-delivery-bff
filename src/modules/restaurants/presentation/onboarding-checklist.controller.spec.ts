import type { Request, Response, Server } from 'restify';

import { IRestaurantRepository } from '../domain/repositories/restaurant.repository.interface';
import { IMenuCategoryRepository } from '../../catalog/domain/repositories/menu-category.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { OnboardingChecklistController } from './onboarding-checklist.controller';

type FakeRequest = Partial<Pick<Request, 'restaurantId'>>;
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  function register(method: string) {
    return (path: string, ...handlers: RouteHandler[]) => {
      routes[`${method} ${path}`] = handlers;
    };
  }
  const application = { get: register('GET'), put: register('PUT'), patch: register('PATCH'), post: register('POST'), del: register('DEL') };
  return { application: application as unknown as Server, routes };
}

async function runAuthenticatedChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) {
    await handler(req, res);
  }
}

const passthroughOperatorMiddleware = async (req: FakeRequest) => {
  req.restaurantId = 'r-1';
};

function buildRestaurant(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', isActive: true, businessHours: [], minimumOrderValue: 0, ...overrides };
}

describe('OnboardingChecklistController', () => {
  function setup(
    restaurantOverrides: Partial<IRestaurantRepository> = {},
    catalogOverrides: { categories?: unknown[]; products?: unknown[] } = {},
  ) {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue(buildRestaurant()),
      ...restaurantOverrides,
    };
    const menuCategoryRepository = { listByRestaurant: jest.fn().mockResolvedValue(catalogOverrides.categories ?? []) } as unknown as IMenuCategoryRepository;
    const productRepository = { listByRestaurant: jest.fn().mockResolvedValue(catalogOverrides.products ?? []) } as unknown as IProductRepository;
    const { application, routes } = buildFakeApplication();
    new OnboardingChecklistController(
      restaurantRepository as IRestaurantRepository,
      menuCategoryRepository,
      productRepository,
      passthroughOperatorMiddleware,
    ).initializeRoutes(application);
    return { routes };
  }

  it('AC-3: restaurante recém-criado (sem endereço/catálogo/horário revisado/Pix) mostra todos os itens pendentes', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /restaurants/me/onboarding-checklist'], {}, { json });

    expect(json).toHaveBeenCalledWith(200, {
      items: [
        { key: 'profile', done: false },
        { key: 'catalog', done: false },
        { key: 'businessHours', done: false },
        { key: 'pix', done: false },
      ],
      allDone: false,
    });
  });

  it('AC-4: com tudo completo (endereço, catálogo, horário revisado, Pix), allDone vem true', async () => {
    const { routes } = setup(
      {
        findById: jest.fn().mockResolvedValue(
          buildRestaurant({
            address: { street: 'Rua 1', number: '10', neighborhood: 'Centro', city: 'Fortaleza', state: 'CE', zipCode: '60000000' },
            businessHoursReviewedAt: new Date('2026-09-17'),
            pixKey: 'chave-pix',
          }),
        ),
      },
      { categories: [{ id: 'c-1' }], products: [{ id: 'p-1' }] },
    );
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /restaurants/me/onboarding-checklist'], {}, { json });

    expect(json).toHaveBeenCalledWith(200, {
      items: [
        { key: 'profile', done: true },
        { key: 'catalog', done: true },
        { key: 'businessHours', done: true },
        { key: 'pix', done: true },
      ],
      allDone: true,
    });
  });

  it('catálogo com categoria mas sem produto ainda conta como pendente', async () => {
    const { routes } = setup({}, { categories: [{ id: 'c-1' }], products: [] });
    const json = jest.fn();

    await runAuthenticatedChain(routes['GET /restaurants/me/onboarding-checklist'], {}, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ items: expect.arrayContaining([{ key: 'catalog', done: false }]) }));
  });

  it('lança 404 quando o restaurante da sessão não existe', async () => {
    const { routes } = setup({ findById: jest.fn().mockResolvedValue(null) });

    await expect(
      runAuthenticatedChain(routes['GET /restaurants/me/onboarding-checklist'], {}, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
