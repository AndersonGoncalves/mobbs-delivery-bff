import type { Request, Response, Server } from 'restify';

import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IPresenceRepository } from '../domain/repositories/presence.repository.interface';
import { PresenceController } from './presence.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { restaurantId?: string };
type FakeResponse = Partial<Pick<Response, 'json' | 'send'>>;
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

// GET /restaurants/me/presence/count: firebaseAuthMiddleware + restaurantOperatorMiddleware
// (2 handlers antes do handler real) — mesmo padrão de accounts-receivable.controller.spec.ts,
// pulando os middlewares (já têm spec própria) e injetando `req.restaurantId` manualmente, como o
// restaurantOperatorMiddleware real faria.
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(2)) {
    await handler(req, res);
  }
}

function buildRestaurant(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', isActive: true, ...overrides };
}

function setup(overrides: { presenceRepository?: Partial<IPresenceRepository>; restaurantRepository?: Partial<IRestaurantRepository> } = {}) {
  const presenceRepository: Partial<IPresenceRepository> = {
    upsertHeartbeat: jest.fn().mockResolvedValue(undefined),
    countActive: jest.fn().mockResolvedValue(5),
    ...overrides.presenceRepository,
  };
  const restaurantRepository: Partial<IRestaurantRepository> = {
    findById: jest.fn().mockResolvedValue(buildRestaurant()),
    ...overrides.restaurantRepository,
  };
  const restaurantOperatorMiddleware = jest.fn(async () => {});
  const { application, routes } = buildFakeApplication();
  new PresenceController(
    presenceRepository as IPresenceRepository,
    restaurantRepository as IRestaurantRepository,
    restaurantOperatorMiddleware,
  ).initializeRoutes(application);
  return { presenceRepository, restaurantRepository, routes };
}

describe('PresenceController (specs/0045-usuarios-online-app)', () => {
  it('AC-1: POST /restaurants/:id/presence/heartbeat grava o heartbeat da sessão e responde 204', async () => {
    const { presenceRepository, routes } = setup();
    const send = jest.fn();

    await routes['POST /restaurants/:id/presence/heartbeat'][0](
      { params: { id: 'r-1' }, body: { sessionId: 'sess-1' } },
      { send },
    );

    expect(presenceRepository.upsertHeartbeat).toHaveBeenCalledWith('r-1', 'sess-1');
    expect(send).toHaveBeenCalledWith(204);
  });

  it('REQ-4/AC-1: restaurante inexistente (não resolvido) não grava heartbeat nenhum — 404', async () => {
    const { presenceRepository, routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue(null) } });
    const send = jest.fn();

    await expect(
      routes['POST /restaurants/:id/presence/heartbeat'][0]({ params: { id: 'r-1' }, body: { sessionId: 'sess-1' } }, { send }),
    ).rejects.toThrow();
    expect(presenceRepository.upsertHeartbeat).not.toHaveBeenCalled();
  });

  it('POST sem sessionId no corpo é rejeitado antes de gravar (400)', async () => {
    const { presenceRepository, routes } = setup();
    const send = jest.fn();

    await expect(
      routes['POST /restaurants/:id/presence/heartbeat'][0]({ params: { id: 'r-1' }, body: {} }, { send }),
    ).rejects.toThrow();
    expect(presenceRepository.upsertHeartbeat).not.toHaveBeenCalled();
  });

  it('AC-3: GET /restaurants/me/presence/count devolve a contagem do restaurante do operador logado', async () => {
    const { presenceRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/presence/count'], { restaurantId: 'r-1' }, { json });

    expect(presenceRepository.countActive).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, { count: 5 });
  });
});
