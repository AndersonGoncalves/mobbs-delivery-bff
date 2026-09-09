import type { Request, Response, Server } from 'restify';

import { IRestaurantRepository } from '../domain/repositories/restaurant.repository.interface';
import { RestaurantsController } from './restaurants.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'restaurantId'>>;
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  function register(method: string) {
    return (path: string, ...handlers: RouteHandler[]) => {
      routes[`${method} ${path}`] = handlers;
    };
  }
  const application = {
    get: register('GET'),
    put: register('PUT'),
    patch: register('PATCH'),
    post: register('POST'),
    del: register('DEL'),
  };
  return { application: application as unknown as Server, routes };
}

async function runChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers) {
    await handler(req, res);
  }
}

// Pula `firebaseAuthMiddleware` (primeiro da chain autenticada) — tem spec própria
// (firebase-auth.middleware.spec.ts); aqui o foco é só o comportamento do controller a partir do
// restaurantOperatorMiddleware (fake, sempre resolve restaurantId '1') em diante.
async function runAuthenticatedChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  return runChain(handlers.slice(1), req, res);
}

const passthroughOperatorMiddleware = async (req: FakeRequest) => {
  req.restaurantId = '1';
};

function buildRestaurant(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '1',
    name: 'Prime Pizza',
    slug: 'primepizza',
    isActive: true,
    businessHours: [],
    minimumOrderValue: 0,
    ...overrides,
  };
}

describe('RestaurantsController', () => {
  describe('GET /restaurants/resolve/:slug (público)', () => {
    it('AC-1: retorna 200 com o restaurante quando o slug corresponde a um ativo', async () => {
      const repository: Partial<IRestaurantRepository> = {
        findBySlug: jest.fn().mockResolvedValue(buildRestaurant()),
      };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );

      const json = jest.fn();
      await routes['GET /restaurants/resolve/:slug'][0]({ params: { slug: 'primepizza' } }, { json });

      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ slug: 'primepizza' }));
    });

    it('AC-2/AC-6: lança erro 404 quando o slug não corresponde a nenhum restaurante', async () => {
      const repository: Partial<IRestaurantRepository> = { findBySlug: jest.fn().mockResolvedValue(null) };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );

      await expect(
        routes['GET /restaurants/resolve/:slug'][0]({ params: { slug: 'inexistente' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('lança erro 404 quando o restaurante existe mas está inativo', async () => {
      const repository: Partial<IRestaurantRepository> = {
        findBySlug: jest.fn().mockResolvedValue(buildRestaurant({ isActive: false, slug: 'fechado' })),
      };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );

      await expect(
        routes['GET /restaurants/resolve/:slug'][0]({ params: { slug: 'fechado' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('rotas autenticadas /restaurants/me/... (specs/0010)', () => {
    function setup(repositoryOverrides: Partial<IRestaurantRepository> = {}) {
      const repository: Partial<IRestaurantRepository> = {
        findById: jest.fn().mockResolvedValue(buildRestaurant()),
        updateProfile: jest.fn().mockResolvedValue(buildRestaurant({ name: 'Novo nome' })),
        updateBusinessHours: jest.fn().mockResolvedValue(buildRestaurant()),
        setActive: jest.fn().mockResolvedValue(buildRestaurant({ isActive: false })),
        updateSlug: jest.fn().mockResolvedValue(buildRestaurant({ slug: 'novo-slug' })),
        ...repositoryOverrides,
      };
      const { application, routes } = buildFakeApplication();
      new RestaurantsController(repository as IRestaurantRepository, passthroughOperatorMiddleware).initializeRoutes(
        application,
      );
      return { repository, routes };
    }

    it('AC-1: GET /restaurants/me retorna o restaurante do restaurantId resolvido pelo token', async () => {
      const { repository, routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(routes['GET /restaurants/me'], { restaurantId: undefined }, { json });

      expect(repository.findById).toHaveBeenCalledWith('1');
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ slug: 'primepizza' }));
    });

    it('AC-1/AC-7: PUT /restaurants/me valida o payload e persiste só os campos enviados', async () => {
      const { repository, routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { name: 'Novo nome' } }, { json });

      expect(repository.updateProfile).toHaveBeenCalledWith('1', { name: 'Novo nome' });
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ name: 'Novo nome' }));
    });

    it('rejeita PUT /restaurants/me com cor fora do formato #RRGGBB', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me'], { body: { primaryColor: 'azul' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('AC-6: rejeita horário com fechamento antes da abertura no mesmo dia', async () => {
      const { routes } = setup();
      const body = [{ dayOfWeek: 'monday', isClosed: false, openTime: '18:00', closeTime: '08:00' }];

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me/business-hours'], { body }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('AC-2: PUT /restaurants/me/business-hours aceita horário válido', async () => {
      const { repository, routes } = setup();
      const body = [{ dayOfWeek: 'monday', isClosed: false, openTime: '08:00', closeTime: '18:00' }];
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me/business-hours'], { body }, { json });

      expect(repository.updateBusinessHours).toHaveBeenCalledWith('1', body);
      expect(json).toHaveBeenCalledWith(200, expect.anything());
    });

    it('AC-3: PATCH /restaurants/me/active desativa o restaurante', async () => {
      const { repository, routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(routes['PATCH /restaurants/me/active'], { body: { isActive: false } }, { json });

      expect(repository.setActive).toHaveBeenCalledWith('1', false);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ isActive: false }));
    });

    it('AC-4/AC-5: GET /restaurants/me/onboarding retorna URL web e link nativo a partir do slug', async () => {
      const { routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(routes['GET /restaurants/me/onboarding'], {}, { json });

      expect(json).toHaveBeenCalledWith(200, {
        slug: 'primepizza',
        webUrl: 'https://primepizza.bsdelivery.com.br',
        nativeLink: 'https://bsdelivery.com.br/r/primepizza',
      });
    });

    it('AC-11: PUT /restaurants/me/slug troca o slug', async () => {
      const { repository, routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(routes['PUT /restaurants/me/slug'], { body: { slug: 'novo-slug' } }, { json });

      expect(repository.updateSlug).toHaveBeenCalledWith('1', 'novo-slug');
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ slug: 'novo-slug' }));
    });

    it('rejeita PUT /restaurants/me/slug com caractere inválido', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(routes['PUT /restaurants/me/slug'], { body: { slug: 'Slug Inválido!' } }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
