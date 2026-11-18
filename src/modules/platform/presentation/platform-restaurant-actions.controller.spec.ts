import type { Request, Response, Server } from 'restify';
import { ConflictError, ForbiddenError, NotFoundError } from 'restify-errors';

import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import { ICashRegisterRepository } from '../../financeiro/domain/repositories/cash-register.repository.interface';
import { ICashRegisterSession } from '../../financeiro/domain/entities/cash-register.entity';
import { IWhatsAppConnectionService } from '../../whatsapp-connection/domain/services/i-whatsapp-connection.service';
import { buildPlatformAdminMiddleware } from '../../../shared/http/platform-admin.middleware';
import { PlatformRestaurantActionsController } from './platform-restaurant-actions.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'user'>>;
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => { routes[`GET ${path}`] = handlers; },
    put: (path: string, ...handlers: RouteHandler[]) => { routes[`PUT ${path}`] = handlers; },
    del: (path: string, ...handlers: RouteHandler[]) => { routes[`DEL ${path}`] = handlers; },
    patch: (path: string, ...handlers: RouteHandler[]) => { routes[`PATCH ${path}`] = handlers; },
    post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; },
  };
  return { application: application as unknown as Server, routes };
}

async function runAdminChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) await handler(req, res);
}

function buildRestaurant(overrides: Partial<IRestaurant> = {}): IRestaurant {
  return { id: 'r-1', name: 'Pizzaria do João', slug: 'pizzaria-do-joao', isActive: true, businessHours: [], minimumOrderValue: 0, ...overrides } as IRestaurant;
}

function buildSession(overrides: Partial<ICashRegisterSession> = {}): ICashRegisterSession {
  return { id: 's-1', restaurantId: 'r-1', openedAt: '2026-11-17T10:00:00.000Z', closedAt: '2026-11-17T22:00:00.000Z', openingBalance: 100, status: 'fechado', ...overrides };
}

describe('PlatformRestaurantActionsController (tela de suporte, pedido explícito do usuário 18/11/2026)', () => {
  function setup(overrides: {
    restaurantRepository?: Partial<IRestaurantRepository>;
    cashRegisterRepository?: Partial<ICashRegisterRepository>;
    whatsAppConnectionService?: Partial<IWhatsAppConnectionService>;
    allowedEmails?: string[];
  } = {}) {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue(buildRestaurant()),
      setActive: jest.fn().mockResolvedValue(buildRestaurant({ isActive: false })),
      updateSlug: jest.fn().mockResolvedValue(buildRestaurant({ slug: 'novo-slug' })),
      ...overrides.restaurantRepository,
    };
    const cashRegisterRepository: Partial<ICashRegisterRepository> = {
      findLatestClosedSession: jest.fn().mockResolvedValue(buildSession()),
      findPendingSessions: jest.fn().mockResolvedValue([]),
      reopen: jest.fn().mockResolvedValue(buildSession({ status: 'aberto', closedAt: undefined })),
      ...overrides.cashRegisterRepository,
    };
    const whatsAppConnectionService: Partial<IWhatsAppConnectionService> = {
      getConnectionStatus: jest.fn().mockResolvedValue(true),
      disconnect: jest.fn().mockResolvedValue(undefined),
      ...overrides.whatsAppConnectionService,
    };
    const platformAdminMiddleware = buildPlatformAdminMiddleware(overrides.allowedEmails ?? ['admin@bsdelivery.com.br']);
    const { application, routes } = buildApp();
    new PlatformRestaurantActionsController(
      restaurantRepository as IRestaurantRepository,
      cashRegisterRepository as ICashRegisterRepository,
      whatsAppConnectionService as IWhatsAppConnectionService,
      platformAdminMiddleware,
    ).initializeRoutes(application);
    return { restaurantRepository, cashRegisterRepository, whatsAppConnectionService, routes };
  }

  const adminReq = (extra: FakeRequest = {}): FakeRequest => ({ params: { id: 'r-1' }, user: { email: 'admin@bsdelivery.com.br' } as Request['user'], ...extra });

  it('rejeita (403) quem não está na lista de e-mails de admin', async () => {
    const { routes } = setup({ allowedEmails: ['outro-admin@bsdelivery.com.br'] });
    await expect(
      runAdminChain(routes['PATCH /platform/restaurants/:id/active'], adminReq({ body: { isActive: false } }), { json: jest.fn(), send: jest.fn() }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('GET active devolve o estado atual do restaurante informado', async () => {
    const { routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ isActive: true })) } });
    const json = jest.fn();

    await runAdminChain(routes['GET /platform/restaurants/:id/active'], adminReq(), { json, send: jest.fn() });

    expect(json).toHaveBeenCalledWith(200, { isActive: true });
  });

  it('PATCH active abre/fecha o restaurante informado', async () => {
    const { routes, restaurantRepository } = setup();
    const json = jest.fn();

    await runAdminChain(routes['PATCH /platform/restaurants/:id/active'], adminReq({ body: { isActive: false } }), { json, send: jest.fn() });

    expect(restaurantRepository.setActive).toHaveBeenCalledWith('r-1', false);
    expect(json).toHaveBeenCalledWith(200, { id: 'r-1', isActive: false });
  });

  it('PUT slug troca o slug do restaurante informado', async () => {
    const { routes, restaurantRepository } = setup();
    const json = jest.fn();

    await runAdminChain(routes['PUT /platform/restaurants/:id/slug'], adminReq({ body: { slug: 'novo-slug' } }), { json, send: jest.fn() });

    expect(restaurantRepository.updateSlug).toHaveBeenCalledWith('r-1', 'novo-slug');
    expect(json).toHaveBeenCalledWith(200, { id: 'r-1', slug: 'novo-slug' });
  });

  it('GET whatsapp/status devolve a conexão do restaurante informado', async () => {
    const { routes, whatsAppConnectionService } = setup();
    const json = jest.fn();

    await runAdminChain(routes['GET /platform/restaurants/:id/whatsapp/status'], adminReq(), { json, send: jest.fn() });

    expect(whatsAppConnectionService.getConnectionStatus).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, { connected: true });
  });

  it('DEL whatsapp força a desconexão do restaurante informado', async () => {
    const { routes, whatsAppConnectionService } = setup();
    await runAdminChain(routes['DEL /platform/restaurants/:id/whatsapp'], adminReq(), { json: jest.fn(), send: jest.fn() });
    expect(whatsAppConnectionService.disconnect).toHaveBeenCalledWith('r-1');
  });

  it('GET cash-register/latest-closed devolve a sessão fechada mais recente', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runAdminChain(routes['GET /platform/restaurants/:id/cash-register/latest-closed'], adminReq(), { json, send: jest.fn() });

    expect(json).toHaveBeenCalledWith(200, { session: buildSession() });
  });

  it('POST cash-register/reopen reabre o caixa fechado mais recente', async () => {
    const { routes, cashRegisterRepository } = setup();
    const json = jest.fn();

    await runAdminChain(routes['POST /platform/restaurants/:id/cash-register/reopen'], adminReq(), { json, send: jest.fn() });

    expect(cashRegisterRepository.reopen).toHaveBeenCalledWith('s-1', 'admin@bsdelivery.com.br');
    expect(json).toHaveBeenCalledWith(200, buildSession({ status: 'aberto', closedAt: undefined }));
  });

  it('POST cash-register/reopen devolve 404 quando não há caixa fechado', async () => {
    const { routes } = setup({ cashRegisterRepository: { findLatestClosedSession: jest.fn().mockResolvedValue(null) } });
    await expect(
      runAdminChain(routes['POST /platform/restaurants/:id/cash-register/reopen'], adminReq(), { json: jest.fn(), send: jest.fn() }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('POST cash-register/reopen devolve 409 quando já existe um caixa aberto', async () => {
    const { routes } = setup({ cashRegisterRepository: { findPendingSessions: jest.fn().mockResolvedValue([buildSession({ status: 'aberto' })]) } });
    await expect(
      runAdminChain(routes['POST /platform/restaurants/:id/cash-register/reopen'], adminReq(), { json: jest.fn(), send: jest.fn() }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
