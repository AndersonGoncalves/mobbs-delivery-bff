import type { Request, Response, Server } from 'restify';

import { IRestaurantOperatorRepository } from '../domain/repositories/restaurant-operator.repository.interface';
import { RestaurantOperatorsController } from './restaurant-operators.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'restaurantId'>>;
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  function register(method: string) {
    return (path: string, ...handlers: RouteHandler[]) => {
      routes[`${method} ${path}`] = handlers;
    };
  }
  const application = { get: register('GET'), post: register('POST'), del: register('DEL') };
  return { application: application as unknown as Server, routes };
}

// Pula `firebaseAuthMiddleware` (primeiro da chain) — tem spec própria
// (firebase-auth.middleware.spec.ts); aqui o foco é o controller a partir do
// restaurantOperatorMiddleware (fake) em diante.
async function runChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) {
    await handler(req, res);
  }
}

const passthroughOperatorMiddleware = async (req: FakeRequest) => {
  req.restaurantId = 'r-1';
};

function buildOperator(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'op-1', restaurantId: 'r-1', email: 'ana@example.com', isActive: true, createdAt: new Date(), ...overrides };
}

describe('RestaurantOperatorsController', () => {
  function setup(repositoryOverrides: Partial<IRestaurantOperatorRepository> = {}) {
    const repository: Partial<IRestaurantOperatorRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildOperator()]),
      create: jest.fn().mockResolvedValue(buildOperator({ email: 'novo@example.com' })),
      findById: jest.fn().mockResolvedValue(buildOperator()),
      countActiveByRestaurant: jest.fn().mockResolvedValue(2),
      deactivate: jest.fn().mockResolvedValue(undefined),
      ...repositoryOverrides,
    };
    const { application, routes } = buildFakeApplication();
    new RestaurantOperatorsController(
      repository as IRestaurantOperatorRepository,
      passthroughOperatorMiddleware,
    ).initializeRoutes(application);
    return { repository, routes };
  }

  it('AC-12: GET /restaurants/me/operators lista os operadores do restaurante do token', async () => {
    const { repository, routes } = setup();
    const json = jest.fn();

    await runChain(routes['GET /restaurants/me/operators'], {}, { json, send: jest.fn() });

    expect(repository.listByRestaurant).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ email: 'ana@example.com' })]);
  });

  it('AC-12: POST /restaurants/me/operators adiciona um e-mail à allowlist', async () => {
    const { repository, routes } = setup();
    const json = jest.fn();

    await runChain(routes['POST /restaurants/me/operators'], { body: { email: 'novo@example.com' } }, { json, send: jest.fn() });

    expect(repository.create).toHaveBeenCalledWith('r-1', 'novo@example.com');
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ email: 'novo@example.com' }));
  });

  it('rejeita POST /restaurants/me/operators com e-mail inválido', async () => {
    const { routes } = setup();

    await expect(
      runChain(routes['POST /restaurants/me/operators'], { body: { email: 'não-é-email' } }, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('AC-12: DELETE /restaurants/me/operators/:id remove um operador quando há mais de um ativo', async () => {
    const { repository, routes } = setup({ countActiveByRestaurant: jest.fn().mockResolvedValue(2) });
    const send = jest.fn();

    await runChain(routes['DEL /restaurants/me/operators/:id'], { params: { id: 'op-1' } }, { json: jest.fn(), send });

    expect(repository.deactivate).toHaveBeenCalledWith('op-1');
    expect(send).toHaveBeenCalledWith(204);
  });

  it('AC-13: bloqueia a remoção do único operador ativo do restaurante', async () => {
    const { repository, routes } = setup({ countActiveByRestaurant: jest.fn().mockResolvedValue(1) });

    await expect(
      runChain(routes['DEL /restaurants/me/operators/:id'], { params: { id: 'op-1' } }, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.deactivate).not.toHaveBeenCalled();
  });

  it('lança 404 ao tentar remover um operador de outro restaurante', async () => {
    const { routes } = setup({ findById: jest.fn().mockResolvedValue(buildOperator({ restaurantId: 'outro-restaurante' })) });

    await expect(
      runChain(routes['DEL /restaurants/me/operators/:id'], { params: { id: 'op-1' } }, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
