import type { Request, Response, Server } from 'restify';

import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IRatingRepository } from '../domain/repositories/rating.repository.interface';
import { RatingsController } from './ratings.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'query'>> & { user?: { uid: string } };
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    post: (path: string, ...handlers: RouteHandler[]) => {
      routes[`POST ${path}`] = handlers;
    },
    get: (path: string, ...handlers: RouteHandler[]) => {
      routes[`GET ${path}`] = handlers;
    },
  };
  return { application: application as unknown as Server, routes };
}

// Pula firebaseAuthMiddleware (primeiro da chain em POST) — tem spec própria — e injeta
// `req.user` manualmente, como o middleware real faria (mesmo padrão de orders.controller.spec.ts).
async function runAuthenticatedChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) {
    await handler(req, res);
  }
}

async function runPublicChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers) {
    await handler(req, res);
  }
}

function buildRestaurant(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', isActive: true, rating: 0, ratingCount: 0, ...overrides };
}

function setup(overrides: {
  ratingRepository?: Partial<IRatingRepository>;
  orderRepository?: Partial<IOrderRepository>;
  restaurantRepository?: Partial<IRestaurantRepository>;
} = {}) {
  const ratingRepository: Partial<IRatingRepository> = {
    upsert: jest.fn().mockResolvedValue({ id: 'rt-1', restaurantId: 'r-1', customerId: 'cu-1', score: 5, createdAt: new Date(), updatedAt: new Date() }),
    getStats: jest.fn().mockResolvedValue({ average: 5, count: 1 }),
    findManyByRestaurant: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    ...overrides.ratingRepository,
  };
  const orderRepository: Partial<IOrderRepository> = {
    hasDeliveredOrder: jest.fn().mockResolvedValue(true),
    ...overrides.orderRepository,
  };
  const restaurantRepository: Partial<IRestaurantRepository> = {
    findById: jest.fn().mockResolvedValue(buildRestaurant()),
    updateRatingStats: jest.fn().mockResolvedValue(buildRestaurant({ rating: 5, ratingCount: 1 })),
    ...overrides.restaurantRepository,
  };
  const { application, routes } = buildFakeApplication();
  new RatingsController(
    ratingRepository as IRatingRepository,
    orderRepository as IOrderRepository,
    restaurantRepository as IRestaurantRepository,
  ).initializeRoutes(application);
  return { ratingRepository, orderRepository, restaurantRepository, routes };
}

describe('RatingsController', () => {
  describe('POST /restaurants/:id/ratings', () => {
    it('AC-8: upsert funciona e recalcula rating/ratingCount do restaurante', async () => {
      const { ratingRepository, restaurantRepository, routes } = setup();
      const json = jest.fn();

      await runAuthenticatedChain(
        routes['POST /restaurants/:id/ratings'],
        { params: { id: 'r-1' }, user: { uid: 'cu-1' }, body: { score: 5, comment: 'Ótimo!' } },
        { json },
      );

      expect(ratingRepository.upsert).toHaveBeenCalledWith({ restaurantId: 'r-1', customerId: 'cu-1', score: 5, comment: 'Ótimo!' });
      expect(restaurantRepository.updateRatingStats).toHaveBeenCalledWith('r-1', 5, 1);
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ score: 5 }));
    });

    it('AC-8: bloqueia sem pedido entregue', async () => {
      const { ratingRepository, routes } = setup({ orderRepository: { hasDeliveredOrder: jest.fn().mockResolvedValue(false) } });

      await expect(
        runAuthenticatedChain(
          routes['POST /restaurants/:id/ratings'],
          { params: { id: 'r-1' }, user: { uid: 'cu-1' }, body: { score: 5 } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(ratingRepository.upsert).not.toHaveBeenCalled();
    });

    it('rejeita score fora de 1-5', async () => {
      const { routes } = setup();

      await expect(
        runAuthenticatedChain(
          routes['POST /restaurants/:id/ratings'],
          { params: { id: 'r-1' }, user: { uid: 'cu-1' }, body: { score: 6 } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('lança 404 quando o restaurante não existe', async () => {
      const { routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue(null) } });

      await expect(
        runAuthenticatedChain(
          routes['POST /restaurants/:id/ratings'],
          { params: { id: 'inexistente' }, user: { uid: 'cu-1' }, body: { score: 5 } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('GET /restaurants/:id/ratings (público)', () => {
    it('lista os ratings paginados, mais recente primeiro', async () => {
      const items = [{ id: 'rt-1', restaurantId: 'r-1', customerId: 'cu-1', score: 5, createdAt: new Date(), updatedAt: new Date() }];
      const { ratingRepository, routes } = setup({ ratingRepository: { findManyByRestaurant: jest.fn().mockResolvedValue({ items, total: 1 }) } });
      const json = jest.fn();

      await runPublicChain(routes['GET /restaurants/:id/ratings'], { params: { id: 'r-1' }, query: {} }, { json });

      expect(ratingRepository.findManyByRestaurant).toHaveBeenCalledWith('r-1', 1, 20);
      expect(json).toHaveBeenCalledWith(200, { items, total: 1 });
    });

    it('lança 404 quando o restaurante não existe', async () => {
      const { routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue(null) } });

      await expect(
        runPublicChain(routes['GET /restaurants/:id/ratings'], { params: { id: 'inexistente' }, query: {} }, { json: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
