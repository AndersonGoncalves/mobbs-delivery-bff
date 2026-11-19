import type { Request, Response, Server } from 'restify';
import { ForbiddenError } from 'restify-errors';

import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import { IFiscalConfigRepository } from '../../fiscal-integration/domain/repositories/fiscal-config.repository.interface';
import { IUberDeliveryConfigRepository } from '../../uber-direct-integration/domain/repositories/uber-delivery-config.repository.interface';
import { buildPlatformAdminMiddleware } from '../../../shared/http/platform-admin.middleware';
import { PlatformRestaurantIntegrationsController } from './platform-restaurant-integrations.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'user'>>;
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => { routes[`GET ${path}`] = handlers; },
    put: (path: string, ...handlers: RouteHandler[]) => { routes[`PUT ${path}`] = handlers; },
    del: (path: string, ...handlers: RouteHandler[]) => { routes[`DEL ${path}`] = handlers; },
  };
  return { application: application as unknown as Server, routes };
}

// [firebaseAuthMiddleware, platformAdminMiddleware, handler] — pula só o firebaseAuth (fake),
// mesmo padrão de `prospects.controller.spec.ts`, mas aqui mantemos o `platformAdminMiddleware`
// REAL na cadeia pra testar o 403 de verdade (ver describe dedicado abaixo).
async function runAdminChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(1)) await handler(req, res);
}

function buildRestaurant(overrides: Partial<IRestaurant> = {}): IRestaurant {
  return {
    id: 'r-1',
    name: 'Pizzaria do João',
    slug: 'pizzaria-do-joao',
    isActive: true,
    businessHours: [],
    minimumOrderValue: 0,
    ...overrides,
  } as IRestaurant;
}

describe('PlatformRestaurantIntegrationsController (tela de suporte, pedido explícito do usuário 18/11/2026)', () => {
  function setup(overrides: {
    restaurantRepository?: Partial<IRestaurantRepository>;
    fiscalConfigRepository?: Partial<IFiscalConfigRepository>;
    uberDeliveryConfigRepository?: Partial<IUberDeliveryConfigRepository>;
    allowedEmails?: string[];
  } = {}) {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue(buildRestaurant()),
      saveIFoodCredentials: jest.fn().mockResolvedValue(buildRestaurant()),
      disconnectIFood: jest.fn().mockResolvedValue(buildRestaurant()),
      saveNinetyNineFoodBinding: jest.fn().mockResolvedValue(buildRestaurant()),
      disconnectNinetyNineFood: jest.fn().mockResolvedValue(buildRestaurant()),
      saveMercadoPagoTokens: jest.fn().mockResolvedValue(buildRestaurant()),
      adminOverrideAsaasCredentials: jest.fn().mockResolvedValue(buildRestaurant()),
      disconnectAsaasSubaccount: jest.fn().mockResolvedValue(buildRestaurant()),
      clearInstagramConnection: jest.fn().mockResolvedValue(buildRestaurant()),
      ...overrides.restaurantRepository,
    };
    const fiscalConfigRepository: Partial<IFiscalConfigRepository> = {
      findByRestaurantId: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({
        restaurantId: 'r-1', focusNfeToken: 'token', environment: 'homologacao', documentType: 'nfce',
        productionEnabled: false, autoEmitEnabled: true, webhookToken: 'wh', cnpj: '11222333000181',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      ...overrides.fiscalConfigRepository,
    };
    const uberDeliveryConfigRepository: Partial<IUberDeliveryConfigRepository> = {
      findByRestaurantId: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({
        restaurantId: 'r-1', customerId: 'c-1', clientId: 'cl-1', clientSecret: 'secret', originZipCode: '60000000', webhookToken: 'wh',
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      ...overrides.uberDeliveryConfigRepository,
    };
    const platformAdminMiddleware = buildPlatformAdminMiddleware(overrides.allowedEmails ?? ['admin@bsdelivery.com.br']);
    const { application, routes } = buildApp();
    new PlatformRestaurantIntegrationsController(
      restaurantRepository as IRestaurantRepository,
      fiscalConfigRepository as IFiscalConfigRepository,
      uberDeliveryConfigRepository as IUberDeliveryConfigRepository,
      platformAdminMiddleware,
    ).initializeRoutes(application);
    return { restaurantRepository, fiscalConfigRepository, uberDeliveryConfigRepository, routes };
  }

  const adminReq = (extra: FakeRequest = {}): FakeRequest => ({ params: { id: 'r-1' }, user: { email: 'admin@bsdelivery.com.br' } as Request['user'], ...extra });

  describe('acesso restrito a admin da plataforma', () => {
    it('rejeita (403) quem não está na lista de e-mails de admin', async () => {
      const { routes } = setup({ allowedEmails: ['outro-admin@bsdelivery.com.br'] });
      const json = jest.fn();

      await expect(
        runAdminChain(routes['GET /platform/restaurants/:id/integrations'], adminReq(), { json, send: jest.fn() }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejeita (403) sem e-mail autenticado', async () => {
      const { routes } = setup();
      await expect(
        runAdminChain(routes['GET /platform/restaurants/:id/integrations'], { params: { id: 'r-1' } }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('permite quem está na lista de e-mails de admin', async () => {
      const { routes } = setup();
      const json = jest.fn();

      await runAdminChain(routes['GET /platform/restaurants/:id/integrations'], adminReq(), { json, send: jest.fn() });

      expect(json).toHaveBeenCalled();
    });
  });

  it('GET agrega as 6 integrações sem expor nenhum segredo bruto', async () => {
    const { routes } = setup({
      restaurantRepository: {
        findById: jest.fn().mockResolvedValue(buildRestaurant({
          ifoodConnectedAt: '2026-01-01T00:00:00.000Z', ifoodMerchantId: 'merchant-1', ifoodClientId: 'client-1', ifoodClientSecret: 'super-secret',
          ninetyNineFoodConnectedAt: '2026-01-01T00:00:00.000Z', ninetyNineFoodAppShopId: 'shop-1', ninetyNineFoodAuthToken: 'super-secret',
          mercadoPagoAccessToken: 'super-secret', mercadoPagoUserId: 'mp-user-1',
          asaasAccountId: 'acc-1', asaasApiKey: 'super-secret', onlinePaymentsEnabled: true,
        })),
      },
      fiscalConfigRepository: {
        findByRestaurantId: jest.fn().mockResolvedValue({
          restaurantId: 'r-1', focusNfeToken: 'super-secret', environment: 'producao', documentType: 'nfce',
          productionEnabled: true, autoEmitEnabled: true, webhookToken: 'super-secret', cnpj: '11222333000181',
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        }),
      },
      uberDeliveryConfigRepository: {
        findByRestaurantId: jest.fn().mockResolvedValue({
          restaurantId: 'r-1', customerId: 'c-1', clientId: 'cl-1', clientSecret: 'super-secret', originZipCode: '60000000', webhookToken: 'wh',
        }),
      },
    });
    const json = jest.fn();

    await runAdminChain(routes['GET /platform/restaurants/:id/integrations'], adminReq(), { json, send: jest.fn() });

    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(JSON.stringify(payload)).not.toContain('super-secret');
    expect(payload).toMatchObject({
      ifood: { connected: true, ifoodMerchantId: 'merchant-1' },
      fiscal: { connected: true, environment: 'producao' },
      uberDirect: { connected: true, customerId: 'c-1' },
      ninetyNineFood: { connected: true, ninetyNineFoodAppShopId: 'shop-1' },
      mercadoPago: { connected: true, mercadoPagoUserId: 'mp-user-1' },
      asaas: { connected: true, asaasAccountId: 'acc-1' },
    });
  });

  it('GET devolve 404 pra restaurante inexistente', async () => {
    const { routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue(null) } });
    await expect(
      runAdminChain(routes['GET /platform/restaurants/:id/integrations'], adminReq(), { json: jest.fn(), send: jest.fn() }),
    ).rejects.toThrow('Restaurante não encontrado');
  });

  it('PUT iFood salva as credenciais do restaurante informado', async () => {
    const { routes, restaurantRepository } = setup();
    const json = jest.fn();
    const body = { ifoodMerchantId: 'merchant-1', ifoodClientId: 'client-1', ifoodClientSecret: 'secret-1' };

    await runAdminChain(routes['PUT /platform/restaurants/:id/integrations/ifood'], adminReq({ body }), { json, send: jest.fn() });

    expect(restaurantRepository.saveIFoodCredentials).toHaveBeenCalledWith('r-1', body);
    expect(json).toHaveBeenCalledWith(200, { ifoodMerchantId: 'merchant-1', connected: true });
  });

  it('DEL iFood desconecta o restaurante informado', async () => {
    const { routes, restaurantRepository } = setup();
    await runAdminChain(routes['DEL /platform/restaurants/:id/integrations/ifood'], adminReq(), { json: jest.fn(), send: jest.fn() });
    expect(restaurantRepository.disconnectIFood).toHaveBeenCalledWith('r-1');
  });

  it('PUT fiscal (FocusNFe) grava a config via upsert', async () => {
    const { routes, fiscalConfigRepository } = setup();
    const json = jest.fn();
    const body = { focusNfeToken: 'token-novo', environment: 'producao', documentType: 'nfce', cnpj: '11222333000181' };

    await runAdminChain(routes['PUT /platform/restaurants/:id/integrations/fiscal'], adminReq({ body }), { json, send: jest.fn() });

    expect(fiscalConfigRepository.upsert).toHaveBeenCalledWith('r-1', body);
    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(payload).not.toHaveProperty('focusNfeToken');
  });

  it('DEL fiscal remove a config do restaurante informado', async () => {
    const { routes, fiscalConfigRepository } = setup();
    await runAdminChain(routes['DEL /platform/restaurants/:id/integrations/fiscal'], adminReq(), { json: jest.fn(), send: jest.fn() });
    expect(fiscalConfigRepository.delete).toHaveBeenCalledWith('r-1');
  });

  it('PUT Uber Direct grava a config via upsert', async () => {
    const { routes, uberDeliveryConfigRepository } = setup();
    const json = jest.fn();
    const body = { customerId: 'c-1', clientId: 'cl-1', clientSecret: 'secret-1', originZipCode: '60000000' };

    await runAdminChain(routes['PUT /platform/restaurants/:id/integrations/uber-direct'], adminReq({ body }), { json, send: jest.fn() });

    expect(uberDeliveryConfigRepository.upsert).toHaveBeenCalledWith('r-1', body);
    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(payload).not.toHaveProperty('clientSecret');
  });

  it('DEL Uber Direct remove a config do restaurante informado', async () => {
    const { routes, uberDeliveryConfigRepository } = setup();
    await runAdminChain(routes['DEL /platform/restaurants/:id/integrations/uber-direct'], adminReq(), { json: jest.fn(), send: jest.fn() });
    expect(uberDeliveryConfigRepository.delete).toHaveBeenCalledWith('r-1');
  });

  it('PUT 99Food grava o override manual (appShopId/authToken/tokenExpiresAt)', async () => {
    const { routes, restaurantRepository } = setup();
    const json = jest.fn();
    const body = { appShopId: 'shop-1', authToken: 'token-1', tokenExpiresAt: '2027-01-01T00:00:00.000Z' };

    await runAdminChain(routes['PUT /platform/restaurants/:id/integrations/99food'], adminReq({ body }), { json, send: jest.fn() });

    expect(restaurantRepository.saveNinetyNineFoodBinding).toHaveBeenCalledWith('r-1', body);
  });

  it('DEL 99Food desconecta o restaurante informado', async () => {
    const { routes, restaurantRepository } = setup();
    await runAdminChain(routes['DEL /platform/restaurants/:id/integrations/99food'], adminReq(), { json: jest.fn(), send: jest.fn() });
    expect(restaurantRepository.disconnectNinetyNineFood).toHaveBeenCalledWith('r-1');
  });

  it('PUT Mercado Pago grava o override manual dos tokens', async () => {
    const { routes, restaurantRepository } = setup();
    const json = jest.fn();
    const body = {
      mercadoPagoAccessToken: 'token-1', mercadoPagoRefreshToken: 'refresh-1',
      mercadoPagoUserId: 'mp-user-1', mercadoPagoTokenExpiresAt: '2027-01-01T00:00:00.000Z',
    };

    await runAdminChain(routes['PUT /platform/restaurants/:id/integrations/mercadopago'], adminReq({ body }), { json, send: jest.fn() });

    expect(restaurantRepository.saveMercadoPagoTokens).toHaveBeenCalledWith('r-1', body);
    expect(json).toHaveBeenCalledWith(200, { mercadoPagoUserId: 'mp-user-1', connected: true });
  });

  it('PUT Asaas grava o override manual das credenciais técnicas', async () => {
    const { routes, restaurantRepository } = setup();
    const json = jest.fn();
    const body = { asaasAccountId: 'acc-1', asaasWalletId: 'wallet-1', asaasApiKey: 'key-1', asaasWebhookToken: 'wh-1' };

    await runAdminChain(routes['PUT /platform/restaurants/:id/integrations/asaas'], adminReq({ body }), { json, send: jest.fn() });

    expect(restaurantRepository.adminOverrideAsaasCredentials).toHaveBeenCalledWith('r-1', body);
    expect(json).toHaveBeenCalledWith(200, { asaasAccountId: 'acc-1', connected: true });
  });

  it('DEL Asaas desvincula (desativa) o restaurante informado', async () => {
    const { routes, restaurantRepository } = setup();
    await runAdminChain(routes['DEL /platform/restaurants/:id/integrations/asaas'], adminReq(), { json: jest.fn(), send: jest.fn() });
    expect(restaurantRepository.disconnectAsaasSubaccount).toHaveBeenCalledWith('r-1');
  });

  it('GET inclui o Instagram (status + username, sem token)', async () => {
    const { routes } = setup({
      restaurantRepository: {
        findById: jest.fn().mockResolvedValue(buildRestaurant({ instagramAccountId: 'ig-1', instagramUsername: 'pizzariadojoao', instagramAccessToken: 'super-secret' })),
      },
    });
    const json = jest.fn();

    await runAdminChain(routes['GET /platform/restaurants/:id/integrations'], adminReq(), { json, send: jest.fn() });

    const [, payload] = json.mock.calls[0] as [number, Record<string, unknown>];
    expect(JSON.stringify(payload)).not.toContain('super-secret');
    expect(payload).toMatchObject({ instagram: { connected: true, instagramUsername: 'pizzariadojoao' } });
  });

  it('DEL Instagram força a desconexão do restaurante informado', async () => {
    const { routes, restaurantRepository } = setup();
    await runAdminChain(routes['DEL /platform/restaurants/:id/integrations/instagram'], adminReq(), { json: jest.fn(), send: jest.fn() });
    expect(restaurantRepository.clearInstagramConnection).toHaveBeenCalledWith('r-1');
  });
});
