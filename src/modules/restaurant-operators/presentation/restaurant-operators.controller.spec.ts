import type { Request, Response, Server } from 'restify';

import { IRestaurantOperatorRepository } from '../domain/repositories/restaurant-operator.repository.interface';
import { RestaurantOperatorsController } from './restaurant-operators.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'restaurantId'>> & {
  operatorRole?: string;
  operatorId?: string;
};
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  function register(method: string) {
    return (path: string, ...handlers: RouteHandler[]) => {
      routes[`${method} ${path}`] = handlers;
    };
  }
  const application = { get: register('GET'), post: register('POST'), del: register('DEL'), patch: register('PATCH') };
  return { application: application as unknown as Server, routes };
}

// Pula `firebaseAuthMiddleware` (primeiro da chain) — tem spec própria
// (firebase-auth.middleware.spec.ts); aqui o foco é o controller a partir do
// restaurantOperatorMiddleware (fake) em diante — inclui `requireOperatorRole` de verdade
// (specs/0021-papeis-operador), então o fake de `restaurantOperatorMiddleware` abaixo precisa
// popular `req.operatorRole`/`req.operatorId`, como o real faria.
async function runChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) {
    await handler(req, res);
  }
}

function buildPassthroughOperatorMiddleware(role = 'dono', operatorId = 'op-1') {
  return async (req: FakeRequest) => {
    req.restaurantId = 'r-1';
    req.operatorRole = role;
    req.operatorId = operatorId;
  };
}

function buildOperator(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'op-1', restaurantId: 'r-1', email: 'ana@example.com', role: 'dono', isActive: true, createdAt: new Date(), ...overrides };
}

describe('RestaurantOperatorsController', () => {
  function setup(
    repositoryOverrides: Partial<IRestaurantOperatorRepository> = {},
    operatorMiddleware = buildPassthroughOperatorMiddleware(),
  ) {
    const repository: Partial<IRestaurantOperatorRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildOperator()]),
      create: jest.fn().mockResolvedValue(buildOperator({ email: 'novo@example.com', role: 'gerente' })),
      findById: jest.fn().mockResolvedValue(buildOperator()),
      countActiveByRestaurant: jest.fn().mockResolvedValue(2),
      countActiveByRestaurantAndRole: jest.fn().mockResolvedValue(2),
      deactivate: jest.fn().mockResolvedValue(undefined),
      updateRole: jest.fn().mockResolvedValue(undefined),
      ...repositoryOverrides,
    };
    const { application, routes } = buildFakeApplication();
    new RestaurantOperatorsController(
      repository as IRestaurantOperatorRepository,
      operatorMiddleware as unknown as (req: Request, res: Response) => Promise<void>,
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

  it('AC-12: POST /restaurants/me/operators adiciona um e-mail à allowlist com um papel', async () => {
    const { repository, routes } = setup();
    const json = jest.fn();

    await runChain(
      routes['POST /restaurants/me/operators'],
      { body: { email: 'novo@example.com', role: 'gerente' } },
      { json, send: jest.fn() },
    );

    expect(repository.create).toHaveBeenCalledWith('r-1', 'novo@example.com', 'gerente');
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ email: 'novo@example.com', role: 'gerente' }));
  });

  it('rejeita POST /restaurants/me/operators com e-mail inválido', async () => {
    const { routes } = setup();

    await expect(
      runChain(routes['POST /restaurants/me/operators'], { body: { email: 'não-é-email', role: 'gerente' } }, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejeita POST /restaurants/me/operators sem papel', async () => {
    const { routes } = setup();

    await expect(
      runChain(routes['POST /restaurants/me/operators'], { body: { email: 'novo@example.com' } }, { json: jest.fn(), send: jest.fn() }),
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

  // specs/0021-papeis-operador REQ-6/AC-5/T018 — só `dono` cadastra/remove/lista operadores.
  it('AC-5/REQ-6: bloqueia gerente tentando cadastrar um operador (403)', async () => {
    const { repository, routes } = setup({}, buildPassthroughOperatorMiddleware('gerente'));

    await expect(
      runChain(
        routes['POST /restaurants/me/operators'],
        { body: { email: 'novo@example.com', role: 'gerente' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('REQ-6: bloqueia financeiro tentando listar operadores (403)', async () => {
    const { routes } = setup({}, buildPassthroughOperatorMiddleware('financeiro'));

    await expect(
      runChain(routes['GET /restaurants/me/operators'], {}, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  // specs/0021-papeis-operador T010 — qualquer operador logado sabe o próprio papel (não exige
  // `dono`; usado pela web pra decidir navegação).
  it('T010: GET /restaurants/me/operators/me devolve o operador logado com o papel, pra qualquer papel', async () => {
    const { repository, routes } = setup(
      { findById: jest.fn().mockResolvedValue(buildOperator({ id: 'op-2', role: 'financeiro' })) },
      buildPassthroughOperatorMiddleware('financeiro', 'op-2'),
    );
    const json = jest.fn();

    await runChain(routes['GET /restaurants/me/operators/me'], {}, { json, send: jest.fn() });

    expect(repository.findById).toHaveBeenCalledWith('op-2');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ id: 'op-2', role: 'financeiro' }));
  });

  // specs/0021-papeis-operador REQ-8/AC-... — `dono` troca o papel de outro operador.
  it('REQ-8: PATCH /restaurants/me/operators/:id/role troca o papel de um operador', async () => {
    const { repository, routes } = setup({
      findById: jest.fn().mockResolvedValue(buildOperator({ id: 'op-2', role: 'gerente' })),
      countActiveByRestaurantAndRole: jest.fn().mockResolvedValue(1),
    });
    const json = jest.fn();

    await runChain(
      routes['PATCH /restaurants/me/operators/:id/role'],
      { params: { id: 'op-2' }, body: { role: 'financeiro' } },
      { json, send: jest.fn() },
    );

    expect(repository.updateRole).toHaveBeenCalledWith('op-2', 'financeiro');
    expect(json).toHaveBeenCalledWith(200, expect.anything());
  });

  it('REQ-6: bloqueia gerente tentando trocar o papel de outro operador (403)', async () => {
    const { repository, routes } = setup({}, buildPassthroughOperatorMiddleware('gerente'));

    await expect(
      runChain(
        routes['PATCH /restaurants/me/operators/:id/role'],
        { params: { id: 'op-2' }, body: { role: 'financeiro' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.updateRole).not.toHaveBeenCalled();
  });

  // specs/0021-papeis-operador REQ-9/AC-6/T019 — nunca pode restar um restaurante sem `dono`.
  it('AC-6/REQ-9: bloqueia (409) rebaixar o único dono ativo do restaurante', async () => {
    const { repository, routes } = setup({
      findById: jest.fn().mockResolvedValue(buildOperator({ id: 'op-1', role: 'dono', isActive: true })),
      countActiveByRestaurantAndRole: jest.fn().mockResolvedValue(1),
    });

    await expect(
      runChain(
        routes['PATCH /restaurants/me/operators/:id/role'],
        { params: { id: 'op-1' }, body: { role: 'gerente' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.updateRole).not.toHaveBeenCalled();
  });

  it('REQ-9: permite rebaixar um dono quando há outro dono ativo no restaurante', async () => {
    const { repository, routes } = setup({
      findById: jest.fn().mockResolvedValue(buildOperator({ id: 'op-1', role: 'dono', isActive: true })),
      countActiveByRestaurantAndRole: jest.fn().mockResolvedValue(2),
    });
    const json = jest.fn();

    await runChain(
      routes['PATCH /restaurants/me/operators/:id/role'],
      { params: { id: 'op-1' }, body: { role: 'gerente' } },
      { json, send: jest.fn() },
    );

    expect(repository.updateRole).toHaveBeenCalledWith('op-1', 'gerente');
  });

  it('lança 404 ao trocar o papel de um operador de outro restaurante', async () => {
    const { routes } = setup({ findById: jest.fn().mockResolvedValue(buildOperator({ restaurantId: 'outro-restaurante' })) });

    await expect(
      runChain(
        routes['PATCH /restaurants/me/operators/:id/role'],
        { params: { id: 'op-1' }, body: { role: 'gerente' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
