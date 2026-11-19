import type { Request, Response, Server } from 'restify';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from 'restify-errors';

import { IRestaurantOperatorRepository } from '../../restaurant-operators/domain/repositories/restaurant-operator.repository.interface';
import { buildPlatformAdminMiddleware } from '../../../shared/http/platform-admin.middleware';
import { PlatformRestaurantOperatorsController } from './platform-restaurant-operators.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'user'>>;
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => { routes[`GET ${path}`] = handlers; },
    post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; },
    del: (path: string, ...handlers: RouteHandler[]) => { routes[`DEL ${path}`] = handlers; },
    patch: (path: string, ...handlers: RouteHandler[]) => { routes[`PATCH ${path}`] = handlers; },
  };
  return { application: application as unknown as Server, routes };
}

async function runAdminChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) await handler(req, res);
}

const FIXED_CREATED_AT = new Date('2026-11-18T12:00:00.000Z');

function buildOperator(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'op-1', restaurantId: 'r-1', email: 'ana@example.com', role: 'dono', isActive: true, createdAt: FIXED_CREATED_AT, ...overrides };
}

describe('PlatformRestaurantOperatorsController (tela de suporte, pedido explícito do usuário 18/11/2026)', () => {
  function setup(overrides: { operatorRepository?: Partial<IRestaurantOperatorRepository>; allowedEmails?: string[] } = {}) {
    const operatorRepository: Partial<IRestaurantOperatorRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue([buildOperator()]),
      create: jest.fn().mockResolvedValue(buildOperator({ id: 'op-2', email: 'novo@example.com', role: 'gerente' })),
      findById: jest.fn().mockResolvedValue(buildOperator()),
      findActiveByEmailInOtherRestaurant: jest.fn().mockResolvedValue(null),
      countActiveByRestaurant: jest.fn().mockResolvedValue(2),
      countActiveByRestaurantAndRole: jest.fn().mockResolvedValue(2),
      deactivate: jest.fn().mockResolvedValue(undefined),
      updateRole: jest.fn().mockResolvedValue(undefined),
      updateFullAccess: jest.fn().mockResolvedValue(undefined),
      updateProfile: jest.fn().mockResolvedValue(undefined),
      recordAdminAction: jest.fn().mockResolvedValue(undefined),
      ...overrides.operatorRepository,
    };
    const platformAdminMiddleware = buildPlatformAdminMiddleware(overrides.allowedEmails ?? ['admin@bsdelivery.com.br']);
    const { application, routes } = buildApp();
    new PlatformRestaurantOperatorsController(operatorRepository as IRestaurantOperatorRepository, platformAdminMiddleware).initializeRoutes(application);
    return { operatorRepository, routes };
  }

  const adminReq = (extra: FakeRequest = {}): FakeRequest => ({ params: { id: 'r-1' }, user: { email: 'admin@bsdelivery.com.br' } as Request['user'], ...extra });

  it('rejeita (403) quem não está na lista de e-mails de admin', async () => {
    const { routes } = setup({ allowedEmails: ['outro-admin@bsdelivery.com.br'] });
    await expect(
      runAdminChain(routes['GET /platform/restaurants/:id/operators'], adminReq(), { json: jest.fn(), send: jest.fn() }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('GET lista os operadores do restaurante informado', async () => {
    const { routes, operatorRepository } = setup();
    const json = jest.fn();
    await runAdminChain(routes['GET /platform/restaurants/:id/operators'], adminReq(), { json, send: jest.fn() });
    expect(operatorRepository.listByRestaurant).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, [buildOperator()]);
  });

  it('POST cria um operador e registra a ação do admin', async () => {
    const { routes, operatorRepository } = setup();
    const json = jest.fn();
    const body = { email: 'novo@example.com', role: 'gerente', name: 'Novo Operador' };

    await runAdminChain(routes['POST /platform/restaurants/:id/operators'], adminReq({ body }), { json, send: jest.fn() });

    expect(operatorRepository.create).toHaveBeenCalledWith('r-1', 'novo@example.com', 'gerente', 'Novo Operador', undefined, undefined);
    expect(operatorRepository.recordAdminAction).toHaveBeenCalledWith('op-2', 'admin@bsdelivery.com.br');
    expect(json).toHaveBeenCalledWith(201, buildOperator());
  });

  it('POST rejeita e-mail já ativo em outro restaurante', async () => {
    const { routes } = setup({ operatorRepository: { findActiveByEmailInOtherRestaurant: jest.fn().mockResolvedValue(buildOperator({ restaurantId: 'r-2' })) } });
    await expect(
      runAdminChain(routes['POST /platform/restaurants/:id/operators'], adminReq({ body: { email: 'ana@example.com', role: 'gerente', name: 'Ana' } }), { json: jest.fn(), send: jest.fn() }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('DEL remove (desativa) um operador e registra a ação do admin', async () => {
    const { routes, operatorRepository } = setup({ operatorRepository: { findById: jest.fn().mockResolvedValue(buildOperator({ role: 'gerente' })) } });
    await runAdminChain(routes['DEL /platform/restaurants/:id/operators/:operatorId'], adminReq({ params: { id: 'r-1', operatorId: 'op-1' } }), { json: jest.fn(), send: jest.fn() });
    expect(operatorRepository.deactivate).toHaveBeenCalledWith('op-1');
    expect(operatorRepository.recordAdminAction).toHaveBeenCalledWith('op-1', 'admin@bsdelivery.com.br');
  });

  it('DEL rejeita remover o operador dono', async () => {
    const { routes } = setup({ operatorRepository: { findById: jest.fn().mockResolvedValue(buildOperator({ role: 'dono' })) } });
    await expect(
      runAdminChain(routes['DEL /platform/restaurants/:id/operators/:operatorId'], adminReq({ params: { id: 'r-1', operatorId: 'op-1' } }), { json: jest.fn(), send: jest.fn() }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('DEL rejeita remover o único operador ativo', async () => {
    const { routes } = setup({
      operatorRepository: {
        findById: jest.fn().mockResolvedValue(buildOperator({ role: 'gerente' })),
        countActiveByRestaurant: jest.fn().mockResolvedValue(1),
      },
    });
    await expect(
      runAdminChain(routes['DEL /platform/restaurants/:id/operators/:operatorId'], adminReq({ params: { id: 'r-1', operatorId: 'op-1' } }), { json: jest.fn(), send: jest.fn() }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('PATCH role troca o papel e registra a ação do admin', async () => {
    const { routes, operatorRepository } = setup({ operatorRepository: { findById: jest.fn().mockResolvedValue(buildOperator({ role: 'gerente' })) } });
    const json = jest.fn();
    await runAdminChain(routes['PATCH /platform/restaurants/:id/operators/:operatorId/role'], adminReq({ params: { id: 'r-1', operatorId: 'op-1' }, body: { role: 'financeiro' } }), { json, send: jest.fn() });
    expect(operatorRepository.updateRole).toHaveBeenCalledWith('op-1', 'financeiro');
    expect(operatorRepository.recordAdminAction).toHaveBeenCalledWith('op-1', 'admin@bsdelivery.com.br');
  });

  it('PATCH role rejeita rebaixar o único dono ativo', async () => {
    const { routes } = setup({ operatorRepository: { countActiveByRestaurantAndRole: jest.fn().mockResolvedValue(1) } });
    await expect(
      runAdminChain(routes['PATCH /platform/restaurants/:id/operators/:operatorId/role'], adminReq({ params: { id: 'r-1', operatorId: 'op-1' }, body: { role: 'gerente' } }), { json: jest.fn(), send: jest.fn() }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('PATCH full-access concede acesso total a um gerente e registra a ação do admin', async () => {
    const { routes, operatorRepository } = setup({ operatorRepository: { findById: jest.fn().mockResolvedValue(buildOperator({ role: 'gerente' })) } });
    const json = jest.fn();
    await runAdminChain(routes['PATCH /platform/restaurants/:id/operators/:operatorId/full-access'], adminReq({ params: { id: 'r-1', operatorId: 'op-1' }, body: { hasFullAccess: true } }), { json, send: jest.fn() });
    expect(operatorRepository.updateFullAccess).toHaveBeenCalledWith('op-1', true);
    expect(operatorRepository.recordAdminAction).toHaveBeenCalledWith('op-1', 'admin@bsdelivery.com.br');
  });

  it('PATCH full-access rejeita conceder a quem não é gerente', async () => {
    const { routes } = setup({ operatorRepository: { findById: jest.fn().mockResolvedValue(buildOperator({ role: 'dono' })) } });
    await expect(
      runAdminChain(routes['PATCH /platform/restaurants/:id/operators/:operatorId/full-access'], adminReq({ params: { id: 'r-1', operatorId: 'op-1' }, body: { hasFullAccess: true } }), { json: jest.fn(), send: jest.fn() }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('PATCH profile edita nome/WhatsApp e registra a ação do admin', async () => {
    const { routes, operatorRepository } = setup();
    const json = jest.fn();
    const body = { name: 'Ana Souza', whatsapp: '85988887777' };
    await runAdminChain(routes['PATCH /platform/restaurants/:id/operators/:operatorId/profile'], adminReq({ params: { id: 'r-1', operatorId: 'op-1' }, body }), { json, send: jest.fn() });
    expect(operatorRepository.updateProfile).toHaveBeenCalledWith('op-1', { name: 'Ana Souza', whatsapp: '5585988887777' });
    expect(operatorRepository.recordAdminAction).toHaveBeenCalledWith('op-1', 'admin@bsdelivery.com.br');
  });

  it('devolve 404 quando o operador não pertence ao restaurante informado', async () => {
    const { routes } = setup({ operatorRepository: { findById: jest.fn().mockResolvedValue(buildOperator({ restaurantId: 'r-2' })) } });
    await expect(
      runAdminChain(routes['DEL /platform/restaurants/:id/operators/:operatorId'], adminReq({ params: { id: 'r-1', operatorId: 'op-1' } }), { json: jest.fn(), send: jest.fn() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
