import type { Request, Response, Server } from 'restify';

import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IRatingRepository } from '../domain/repositories/rating.repository.interface';
import { RatingsController } from './ratings.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'query'>> & { user?: { uid: string }; restaurantId?: string };
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
    patch: (path: string, ...handlers: RouteHandler[]) => {
      routes[`PATCH ${path}`] = handlers;
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

// specs/0078-resposta-restaurante-avaliacoes — pula firebaseAuthMiddleware +
// restaurantOperatorMiddleware + requireOperatorRole (3 primeiros da chain do PATCH .../reply),
// mesmo padrão de promotions.controller.spec.ts.
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(3)) {
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
    reply: jest.fn().mockResolvedValue({
      id: 'rt-1',
      restaurantId: 'r-1',
      customerId: 'cu-1',
      score: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
      reply: { text: 'Obrigado!', createdAt: new Date() },
    }),
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
  const restaurantOperatorMiddleware = jest.fn(async () => {});
  const { application, routes } = buildFakeApplication();
  new RatingsController(
    ratingRepository as IRatingRepository,
    orderRepository as IOrderRepository,
    restaurantRepository as IRestaurantRepository,
    restaurantOperatorMiddleware,
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

  describe('GET /restaurants/:id/ratings/eligibility', () => {
    it('AC-8: devolve canRate=true quando o cliente tem pedido entregue', async () => {
      const { routes } = setup({ orderRepository: { hasDeliveredOrder: jest.fn().mockResolvedValue(true) } });
      const json = jest.fn();

      await runAuthenticatedChain(
        routes['GET /restaurants/:id/ratings/eligibility'],
        { params: { id: 'r-1' }, user: { uid: 'cu-1' } },
        { json },
      );

      expect(json).toHaveBeenCalledWith(200, { canRate: true });
    });

    it('AC-8: devolve canRate=false sem pedido entregue', async () => {
      const { routes } = setup({ orderRepository: { hasDeliveredOrder: jest.fn().mockResolvedValue(false) } });
      const json = jest.fn();

      await runAuthenticatedChain(
        routes['GET /restaurants/:id/ratings/eligibility'],
        { params: { id: 'r-1' }, user: { uid: 'cu-1' } },
        { json },
      );

      expect(json).toHaveBeenCalledWith(200, { canRate: false });
    });

    it('lança 404 quando o restaurante não existe', async () => {
      const { routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue(null) } });

      await expect(
        runAuthenticatedChain(
          routes['GET /restaurants/:id/ratings/eligibility'],
          { params: { id: 'inexistente' }, user: { uid: 'cu-1' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // specs/0078-resposta-restaurante-avaliacoes
  describe('PATCH /restaurants/me/ratings/:id/reply', () => {
    it('AC-1: responde uma avaliação sem resposta ainda', async () => {
      const { ratingRepository, routes } = setup();
      const json = jest.fn();

      await runOperatorChain(
        routes['PATCH /restaurants/me/ratings/:id/reply'],
        { params: { id: 'rt-1' }, restaurantId: 'r-1', body: { text: 'Obrigado pela avaliação!' } },
        { json },
      );

      expect(ratingRepository.reply).toHaveBeenCalledWith('rt-1', 'r-1', 'Obrigado pela avaliação!');
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ reply: expect.objectContaining({ text: 'Obrigado!' }) }));
    });

    it('AC-2: responder de novo substitui a resposta anterior (upsert, não uma 2ª resposta)', async () => {
      const { ratingRepository, routes } = setup();

      await runOperatorChain(
        routes['PATCH /restaurants/me/ratings/:id/reply'],
        { params: { id: 'rt-1' }, restaurantId: 'r-1', body: { text: 'Resposta nova' } },
        { json: jest.fn() },
      );

      expect(ratingRepository.reply).toHaveBeenCalledTimes(1);
      expect(ratingRepository.reply).toHaveBeenCalledWith('rt-1', 'r-1', 'Resposta nova');
    });

    it('AC-3: rejeita (404) responder uma avaliação de outro restaurante', async () => {
      const { routes } = setup({ ratingRepository: { reply: jest.fn().mockResolvedValue(null) } });

      await expect(
        runOperatorChain(
          routes['PATCH /restaurants/me/ratings/:id/reply'],
          { params: { id: 'rt-de-outro-restaurante' }, restaurantId: 'r-1', body: { text: 'Obrigado!' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('rejeita texto vazio', async () => {
      const { routes } = setup();

      await expect(
        runOperatorChain(
          routes['PATCH /restaurants/me/ratings/:id/reply'],
          { params: { id: 'rt-1' }, restaurantId: 'r-1', body: { text: '' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
