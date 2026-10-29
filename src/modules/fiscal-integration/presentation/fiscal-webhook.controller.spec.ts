import type { Request, Response, Server } from 'restify';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IFiscalConfigRepository } from '../domain/repositories/fiscal-config.repository.interface';
import { IFiscalConfig } from '../domain/entities/fiscal-config.entity';
import { FiscalEmissionService } from '../domain/services/fiscal-emission.service';
import { FiscalWebhookController } from './fiscal-webhook.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { header?: (name: string) => string | undefined };
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = { post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; } };
  return { application: application as unknown as Server, routes };
}

function buildReq(token: string | undefined, body: unknown, restaurantId = 'r-1'): FakeRequest {
  return { params: { restaurantId }, body, header: (name: string) => (name === 'focusnfe-webhook-token' ? token : undefined) };
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o-1', orderNumber: 1, customerId: 'c-1', restaurantId: 'r-1', items: [], orderType: 'delivery',
    status: 'entregue', statusHistory: [], subtotal: 30, deliveryFee: 0, discount: 0, total: 30,
    paymentMethod: 'pix', createdAt: new Date().toISOString(), ...overrides,
  };
}

function buildConfig(overrides: Partial<IFiscalConfig> = {}): IFiscalConfig {
  return {
    restaurantId: 'r-1',
    focusNfeToken: 'token-1',
    environment: 'homologacao',
    documentType: 'nfce',
    productionEnabled: false,
    webhookToken: 'webhook-token-1',
    cnpj: '11222333000181',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('FiscalWebhookController (specs/0091-integracao-fiscal-focusnfe REQ-3)', () => {
  function setup(overrides: {
    fiscalConfigRepository?: Partial<IFiscalConfigRepository>;
    orderRepository?: Partial<IOrderRepository>;
    fiscalEmissionService?: Partial<FiscalEmissionService>;
  } = {}) {
    const fiscalConfigRepository: Partial<IFiscalConfigRepository> = {
      findByRestaurantId: jest.fn().mockResolvedValue(buildConfig()),
      ...overrides.fiscalConfigRepository,
    };
    const orderRepository: Partial<IOrderRepository> = {
      findById: jest.fn().mockResolvedValue(buildOrder()),
      ...overrides.orderRepository,
    };
    const fiscalEmissionService: Partial<FiscalEmissionService> = {
      applyWebhookResult: jest.fn().mockResolvedValue(undefined),
      ...overrides.fiscalEmissionService,
    };
    const { application, routes } = buildApp();
    new FiscalWebhookController(
      fiscalConfigRepository as IFiscalConfigRepository,
      orderRepository as IOrderRepository,
      fiscalEmissionService as FiscalEmissionService,
    ).initializeRoutes(application);
    return { fiscalConfigRepository, orderRepository, fiscalEmissionService, routes };
  }

  it('AC-3: token válido aplica o resultado ao pedido identificado por "ref"', async () => {
    const { fiscalEmissionService, routes } = setup();
    const send = jest.fn();

    await routes['POST /webhooks/focusnfe/:restaurantId'][0](
      buildReq('webhook-token-1', { ref: 'o-1', status: 'autorizado', caminho_danfe: '/notas/o-1.html' }),
      { json: jest.fn(), send },
    );

    expect(fiscalEmissionService.applyWebhookResult).toHaveBeenCalledWith('o-1', { ref: 'o-1', status: 'autorizado', caminho_danfe: '/notas/o-1.html' });
    expect(send).toHaveBeenCalledWith(200);
  });

  it('token inválido/ausente rejeita com 401 (sem config, ou token não bate)', async () => {
    const { routes } = setup();

    await expect(
      routes['POST /webhooks/focusnfe/:restaurantId'][0](buildReq('token-errado', { ref: 'o-1', status: 'autorizado' }), { json: jest.fn(), send: jest.fn() }),
    ).rejects.toThrow();
  });

  it('pedido de outro restaurante (ref não pertence ao :restaurantId do path) devolve 404', async () => {
    const { routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ restaurantId: 'r-2' })) } });

    await expect(
      routes['POST /webhooks/focusnfe/:restaurantId'][0](buildReq('webhook-token-1', { ref: 'o-1', status: 'autorizado' }), { json: jest.fn(), send: jest.fn() }),
    ).rejects.toThrow();
  });

  it('payload sem "ref" responde 200 sem erro (evento que não interessa, evita reentrega)', async () => {
    const { fiscalEmissionService, routes } = setup();
    const send = jest.fn();

    await routes['POST /webhooks/focusnfe/:restaurantId'][0](buildReq('webhook-token-1', { status: 'alguma_coisa' }), { json: jest.fn(), send });

    expect(fiscalEmissionService.applyWebhookResult).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(200);
  });
});
