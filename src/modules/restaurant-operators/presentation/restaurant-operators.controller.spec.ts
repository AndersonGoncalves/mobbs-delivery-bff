import type { Request, Response, Server } from 'restify';

import { IRestaurantOperatorRepository } from '../domain/repositories/restaurant-operator.repository.interface';
import { RestaurantOperatorsController } from './restaurant-operators.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'restaurantId'>> & {
  operatorRole?: string;
  operatorId?: string;
  hasFullAccess?: boolean;
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

function buildPassthroughOperatorMiddleware(role = 'dono', operatorId = 'op-1', hasFullAccess = false) {
  return async (req: FakeRequest) => {
    req.restaurantId = 'r-1';
    req.operatorRole = role;
    req.operatorId = operatorId;
    req.hasFullAccess = hasFullAccess;
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
      findActiveByEmailInOtherRestaurant: jest.fn().mockResolvedValue(null),
      countActiveByRestaurant: jest.fn().mockResolvedValue(2),
      countActiveByRestaurantAndRole: jest.fn().mockResolvedValue(2),
      deactivate: jest.fn().mockResolvedValue(undefined),
      updateRole: jest.fn().mockResolvedValue(undefined),
      updateFullAccess: jest.fn().mockResolvedValue(undefined),
      updateProfile: jest.fn().mockResolvedValue(undefined),
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

  it('AC-12: POST /restaurants/me/operators cria operador com nome e papel', async () => {
    const { repository, routes } = setup();
    const json = jest.fn();

    await runChain(
      routes['POST /restaurants/me/operators'],
      { body: { email: 'novo@example.com', role: 'gerente', name: 'João' } },
      { json, send: jest.fn() },
    );

    expect(repository.create).toHaveBeenCalledWith('r-1', 'novo@example.com', 'gerente', 'João', undefined, undefined);
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ email: 'novo@example.com', role: 'gerente' }));
  });

  it('POST /restaurants/me/operators persiste WhatsApp normalizado e foto', async () => {
    const { repository, routes } = setup();
    const json = jest.fn();

    await runChain(
      routes['POST /restaurants/me/operators'],
      {
        body: {
          email: 'novo@example.com',
          role: 'garcom',
          name: 'João',
          whatsapp: '(11)99999-9999',
          photoUrl: 'https://images.example.com/operator.jpg',
        },
      },
      { json, send: jest.fn() },
    );

    expect(repository.create).toHaveBeenCalledWith(
      'r-1',
      'novo@example.com',
      'garcom',
      'João',
      '5511999999999',
      'https://images.example.com/operator.jpg',
    );
  });

  it('rejeita cadastro de operador sem nome', async () => {
    const { repository, routes } = setup();

    await expect(
      runChain(
        routes['POST /restaurants/me/operators'],
        { body: { email: 'novo@example.com', role: 'gerente' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  // specs/0095-isolamento-cadastro-operadores REQ-1/REQ-2.
  it('AC-1 (specs/0095): POST /restaurants/me/operators rejeita (409) e-mail com vínculo ativo em outro restaurante', async () => {
    const { repository, routes } = setup({
      findActiveByEmailInOtherRestaurant: jest.fn().mockResolvedValue(buildOperator({ restaurantId: 'r-OUTRO' })),
    });

    await expect(
      runChain(routes['POST /restaurants/me/operators'], { body: { email: 'ana@example.com', role: 'gerente', name: 'Ana' } }, { json: jest.fn(), send: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(repository.findActiveByEmailInOtherRestaurant).toHaveBeenCalledWith('ana@example.com', 'r-1');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('AC-2 (specs/0095): POST /restaurants/me/operators adiciona e-mail sem vínculo ativo em outro restaurante', async () => {
    const { repository, routes } = setup();
    const json = jest.fn();

    await runChain(routes['POST /restaurants/me/operators'], { body: { email: 'novo@example.com', role: 'gerente', name: 'João' } }, { json, send: jest.fn() });

    expect(repository.create).toHaveBeenCalledWith('r-1', 'novo@example.com', 'gerente', 'João', undefined, undefined);
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
    const { repository, routes } = setup({
      countActiveByRestaurant: jest.fn().mockResolvedValue(2),
      findById: jest.fn().mockResolvedValue(buildOperator({ role: 'gerente' })),
    });
    const send = jest.fn();

    await runChain(routes['DEL /restaurants/me/operators/:id'], { params: { id: 'op-1' } }, { json: jest.fn(), send });

    expect(repository.deactivate).toHaveBeenCalledWith('op-1');
    expect(send).toHaveBeenCalledWith(204);
  });

  it('AC-13: bloqueia a remoção do único operador ativo do restaurante', async () => {
    const { repository, routes } = setup({
      countActiveByRestaurant: jest.fn().mockResolvedValue(1),
      findById: jest.fn().mockResolvedValue(buildOperator({ role: 'gerente' })),
    });

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

  it('não permite remover um operador com papel dono nem pela API', async () => {
    const { repository, routes } = setup();

    await expect(
      runChain(
        routes['DEL /restaurants/me/operators/:id'],
        { params: { id: 'op-1' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.deactivate).not.toHaveBeenCalled();
  });

  it('gerente pode cadastrar operadores, mas não conceder acesso total', async () => {
    const { repository, routes } = setup({}, buildPassthroughOperatorMiddleware('gerente'));

    await runChain(
      routes['POST /restaurants/me/operators'],
      { body: { email: 'novo@example.com', role: 'gerente', name: 'João' } },
      { json: jest.fn(), send: jest.fn() },
    );
    expect(repository.create).toHaveBeenCalled();
  });

  it('gerente não pode cadastrar um novo operador com papel dono', async () => {
    const { repository, routes } = setup({}, buildPassthroughOperatorMiddleware('gerente'));

    await expect(
      runChain(
        routes['POST /restaurants/me/operators'],
        { body: { email: 'novo@example.com', role: 'dono', name: 'João' } },
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

  // specs/0137-papeis-garcom-motoboy REQ-6.
  it('AC-6: GET /restaurants/me/operators/motoboys lista só os operadores motoboy ativos, com email como nome quando não tem nome cadastrado', async () => {
    const { repository, routes } = setup({
      listByRestaurant: jest.fn().mockResolvedValue([
        buildOperator({ id: 'op-1', email: 'carlos@example.com', role: 'motoboy', isActive: true }),
        buildOperator({ id: 'op-2', email: 'inativo@example.com', role: 'motoboy', isActive: false }),
        buildOperator({ id: 'op-3', email: 'dono@example.com', role: 'dono', isActive: true }),
      ]),
    }, buildPassthroughOperatorMiddleware('gerente'));
    const json = jest.fn();

    await runChain(routes['GET /restaurants/me/operators/motoboys'], {}, { json, send: jest.fn() });

    expect(repository.listByRestaurant).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [
      { id: 'op-1', name: 'carlos@example.com', email: 'carlos@example.com', whatsapp: undefined },
    ]);
  });

  // (ajuste, pedido explícito do usuário) — nome de verdade, quando cadastrado, em vez do e-mail.
  it('GET /restaurants/me/operators/motoboys usa o nome cadastrado quando existe, em vez do e-mail', async () => {
    const { routes } = setup({
      listByRestaurant: jest.fn().mockResolvedValue([
        buildOperator({ id: 'op-1', email: 'carlos@example.com', name: 'Carlos', role: 'motoboy', isActive: true }),
      ]),
    }, buildPassthroughOperatorMiddleware('gerente'));
    const json = jest.fn();

    await runChain(routes['GET /restaurants/me/operators/motoboys'], {}, { json, send: jest.fn() });

    expect(json).toHaveBeenCalledWith(200, [
      { id: 'op-1', name: 'Carlos', email: 'carlos@example.com', whatsapp: undefined },
    ]);
  });

  // (ajuste, pedido explícito do usuário) — WhatsApp do motoboy vai junto, pro ícone de ação na
  // web (`MotoboyListPage`); undefined quando o motoboy não tem WhatsApp cadastrado.
  it('GET /restaurants/me/operators/motoboys inclui o WhatsApp do motoboy quando cadastrado', async () => {
    const { routes } = setup({
      listByRestaurant: jest.fn().mockResolvedValue([
        buildOperator({ id: 'op-1', email: 'carlos@example.com', whatsapp: '5585986404604', role: 'motoboy', isActive: true }),
      ]),
    }, buildPassthroughOperatorMiddleware('gerente'));
    const json = jest.fn();

    await runChain(routes['GET /restaurants/me/operators/motoboys'], {}, { json, send: jest.fn() });

    expect(json).toHaveBeenCalledWith(200, [
      { id: 'op-1', name: 'carlos@example.com', email: 'carlos@example.com', whatsapp: '5585986404604' },
    ]);
  });

  it('caixa pode listar operadores motoboy', async () => {
    const { repository, routes } = setup({}, buildPassthroughOperatorMiddleware('financeiro'));

    await runChain(routes['GET /restaurants/me/operators/motoboys'], {}, { json: jest.fn(), send: jest.fn() });
    expect(repository.listByRestaurant).toHaveBeenCalledWith('r-1');
  });

  // (ajuste, pedido explícito do usuário) — equivalente ao de motoboys, pra "Cadastro de
  // garçons" (web), agora só leitura.
  it('GET /restaurants/me/operators/waiters lista só os operadores garcom ativos', async () => {
    const { repository, routes } = setup({
      listByRestaurant: jest.fn().mockResolvedValue([
        buildOperator({ id: 'op-1', email: 'joao@example.com', name: 'João', role: 'garcom', isActive: true }),
        buildOperator({ id: 'op-2', email: 'inativo@example.com', role: 'garcom', isActive: false }),
        buildOperator({ id: 'op-3', email: 'dono@example.com', role: 'dono', isActive: true }),
      ]),
    }, buildPassthroughOperatorMiddleware('gerente'));
    const json = jest.fn();

    await runChain(routes['GET /restaurants/me/operators/waiters'], {}, { json, send: jest.fn() });

    expect(repository.listByRestaurant).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [{ id: 'op-1', name: 'João', email: 'joao@example.com' }]);
  });

  it('caixa pode listar operadores garçom', async () => {
    const { repository, routes } = setup({}, buildPassthroughOperatorMiddleware('financeiro'));

    await runChain(routes['GET /restaurants/me/operators/waiters'], {}, { json: jest.fn(), send: jest.fn() });
    expect(repository.listByRestaurant).toHaveBeenCalledWith('r-1');
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

  it('gerente consegue alterar papel de operador não dono', async () => {
    const { repository, routes } = setup(
      { findById: jest.fn().mockResolvedValue(buildOperator({ id: 'op-2', role: 'gerente' })) },
      buildPassthroughOperatorMiddleware('gerente'),
    );

    await runChain(
      routes['PATCH /restaurants/me/operators/:id/role'],
      { params: { id: 'op-2' }, body: { role: 'financeiro' } },
      { json: jest.fn(), send: jest.fn() },
    );
    expect(repository.updateRole).toHaveBeenCalledWith('op-2', 'financeiro');
  });

  it('gerente com acesso total não pode alterar o papel do dono', async () => {
    const { repository, routes } = setup(
      { findById: jest.fn().mockResolvedValue(buildOperator({ role: 'dono' })) },
      buildPassthroughOperatorMiddleware('gerente', 'op-2', true),
    );

    await expect(
      runChain(
        routes['PATCH /restaurants/me/operators/:id/role'],
        { params: { id: 'op-1' }, body: { role: 'gerente' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.updateRole).not.toHaveBeenCalled();
  });

  it('o dono concede acesso total somente a um gerente', async () => {
    const { repository, routes } = setup({
      findById: jest.fn().mockResolvedValue(buildOperator({ id: 'op-2', role: 'gerente' })),
    });
    const json = jest.fn();

    await runChain(
      routes['PATCH /restaurants/me/operators/:id/full-access'],
      { params: { id: 'op-2' }, body: { hasFullAccess: true } },
      { json, send: jest.fn() },
    );

    expect(repository.updateFullAccess).toHaveBeenCalledWith('op-2', true);
    expect(json).toHaveBeenCalledWith(200, expect.anything());
  });

  it('gerente com acesso total não pode alterar o próprio atributo de acesso total', async () => {
    const { repository, routes } = setup(
      { findById: jest.fn().mockResolvedValue(buildOperator({ id: 'op-2', role: 'gerente' })) },
      buildPassthroughOperatorMiddleware('gerente', 'op-2', true),
    );

    await expect(
      runChain(
        routes['PATCH /restaurants/me/operators/:id/full-access'],
        { params: { id: 'op-2' }, body: { hasFullAccess: false } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.updateFullAccess).not.toHaveBeenCalled();
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

  // (ajuste, pedido explícito do usuário) — editar nome/WhatsApp/foto de um operador já
  // cadastrado, nunca o e-mail.
  it('PATCH /restaurants/me/operators/:id/profile edita nome/WhatsApp/foto de um operador', async () => {
    const { repository, routes } = setup({
      findById: jest.fn().mockResolvedValue(buildOperator({ id: 'op-2', role: 'garcom', name: undefined })),
    });
    const json = jest.fn();

    await runChain(
      routes['PATCH /restaurants/me/operators/:id/profile'],
      { params: { id: 'op-2' }, body: { name: 'Esther', whatsapp: '(11)99999-9999', photoUrl: 'https://images.example.com/esther.jpg' } },
      { json, send: jest.fn() },
    );

    expect(repository.updateProfile).toHaveBeenCalledWith('op-2', {
      name: 'Esther',
      whatsapp: '5511999999999',
      photoUrl: 'https://images.example.com/esther.jpg',
    });
    expect(json).toHaveBeenCalledWith(200, expect.anything());
  });

  it('0176: PATCH .../profile aceita remoção explícita de foto', async () => {
    const { repository, routes } = setup();
    await runChain(
      routes['PATCH /restaurants/me/operators/:id/profile'],
      { params: { id: 'op-1' }, body: { name: 'Ana', photoUrl: null } },
      { json: jest.fn(), send: jest.fn() },
    );
    expect(repository.updateProfile).toHaveBeenCalledWith('op-1', { name: 'Ana', photoUrl: null });
  });

  it('0176: PATCH .../profile sem photoUrl não solicita apagar a foto', async () => {
    const { repository, routes } = setup();
    await runChain(
      routes['PATCH /restaurants/me/operators/:id/profile'],
      { params: { id: 'op-1' }, body: { name: 'Ana' } },
      { json: jest.fn(), send: jest.fn() },
    );
    expect(repository.updateProfile).toHaveBeenCalledWith('op-1', { name: 'Ana' });
  });

  it('rejeita PATCH .../profile sem nome', async () => {
    const { repository, routes } = setup();

    await expect(
      runChain(
        routes['PATCH /restaurants/me/operators/:id/profile'],
        { params: { id: 'op-1' }, body: {} },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.updateProfile).not.toHaveBeenCalled();
  });

  it('PATCH .../profile ignora um e-mail enviado no corpo — nunca repassa pro repositório', async () => {
    const { repository, routes } = setup();
    const json = jest.fn();

    await runChain(
      routes['PATCH /restaurants/me/operators/:id/profile'],
      { params: { id: 'op-1' }, body: { name: 'Ana', email: 'outro@example.com' } },
      { json, send: jest.fn() },
    );

    expect(repository.updateProfile).toHaveBeenCalledWith('op-1', { name: 'Ana' });
  });

  it('gerente não pode editar o perfil do dono', async () => {
    const { repository, routes } = setup(
      { findById: jest.fn().mockResolvedValue(buildOperator({ role: 'dono' })) },
      buildPassthroughOperatorMiddleware('gerente', 'op-2', true),
    );

    await expect(
      runChain(
        routes['PATCH /restaurants/me/operators/:id/profile'],
        { params: { id: 'op-1' }, body: { name: 'Novo nome' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.updateProfile).not.toHaveBeenCalled();
  });

  it('gerente pode editar o perfil de um operador não dono', async () => {
    const { repository, routes } = setup(
      { findById: jest.fn().mockResolvedValue(buildOperator({ id: 'op-2', role: 'garcom' })) },
      buildPassthroughOperatorMiddleware('gerente'),
    );

    await runChain(
      routes['PATCH /restaurants/me/operators/:id/profile'],
      { params: { id: 'op-2' }, body: { name: 'Novo nome' } },
      { json: jest.fn(), send: jest.fn() },
    );
    expect(repository.updateProfile).toHaveBeenCalledWith('op-2', { name: 'Novo nome' });
  });

  it('lança 404 ao editar o perfil de um operador de outro restaurante', async () => {
    const { routes } = setup({ findById: jest.fn().mockResolvedValue(buildOperator({ restaurantId: 'outro-restaurante' })) });

    await expect(
      runChain(
        routes['PATCH /restaurants/me/operators/:id/profile'],
        { params: { id: 'op-1' }, body: { name: 'X' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
