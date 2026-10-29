import type { Request, Response, Server } from 'restify';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IFiscalConfigRepository } from '../domain/repositories/fiscal-config.repository.interface';
import { IFiscalConfig } from '../domain/entities/fiscal-config.entity';
import { FiscalEmissionService } from '../domain/services/fiscal-emission.service';
import { FiscalOrderActionsController } from './fiscal-order-actions.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { restaurantId?: string };
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = { post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; } };
  return { application: application as unknown as Server, routes };
}

// [firebaseAuthMiddleware, restaurantOperatorMiddleware, requireOperatorRole, handler].
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse) {
  for (const handler of handlers.slice(3)) await handler(req, res);
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

describe('FiscalOrderActionsController (specs/0091-integracao-fiscal-focusnfe REQ-4/REQ-6)', () => {
  function setup(overrides: {
    orderRepository?: Partial<IOrderRepository>;
    fiscalConfigRepository?: Partial<IFiscalConfigRepository>;
    fiscalEmissionService?: Partial<FiscalEmissionService>;
  } = {}) {
    const orderRepository: Partial<IOrderRepository> = {
      findById: jest.fn().mockResolvedValue(buildOrder()),
      ...overrides.orderRepository,
    };
    const fiscalConfigRepository: Partial<IFiscalConfigRepository> = {
      findByRestaurantId: jest.fn().mockResolvedValue(buildConfig()),
      ...overrides.fiscalConfigRepository,
    };
    const fiscalEmissionService: Partial<FiscalEmissionService> = {
      retryEmission: jest.fn().mockResolvedValue(undefined),
      cancelDocument: jest.fn().mockResolvedValue(undefined),
      ...overrides.fiscalEmissionService,
    };
    const { application, routes } = buildApp();
    new FiscalOrderActionsController(
      orderRepository as IOrderRepository,
      fiscalConfigRepository as IFiscalConfigRepository,
      fiscalEmissionService as FiscalEmissionService,
      jest.fn(),
    ).initializeRoutes(application);
    return { orderRepository, fiscalConfigRepository, fiscalEmissionService, routes };
  }

  describe('POST .../fiscal/retry (REQ-4)', () => {
    it('AC-3: reemite um pedido sem nota emitida ainda', async () => {
      const { fiscalEmissionService, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ fiscal: { status: 'rejeitado', rejectedReason: 'Rejeição 704' } })) },
      });
      const json = jest.fn();

      await runOperatorChain(routes['POST /restaurants/me/orders/:id/fiscal/retry'], { restaurantId: 'r-1', params: { id: 'o-1' } }, { json, send: jest.fn() });

      expect(fiscalEmissionService.retryEmission).toHaveBeenCalled();
      expect(json).toHaveBeenCalled();
    });

    it('pedido já com nota emitida rejeita a reemissão (409)', async () => {
      const { fiscalEmissionService, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ fiscal: { status: 'emitido', ref: 'o-1' } })) },
      });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/orders/:id/fiscal/retry'], { restaurantId: 'r-1', params: { id: 'o-1' } }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow();
      expect(fiscalEmissionService.retryEmission).not.toHaveBeenCalled();
    });

    it('pedido cancelado rejeita a reemissão (REQ-6 vale pra reemissão manual também)', async () => {
      const { fiscalEmissionService, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ status: 'cancelado' })) },
      });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/orders/:id/fiscal/retry'], { restaurantId: 'r-1', params: { id: 'o-1' } }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow();
      expect(fiscalEmissionService.retryEmission).not.toHaveBeenCalled();
    });

    it('produção sem o botão "ativar produção" ligado rejeita a reemissão', async () => {
      const { fiscalEmissionService, routes } = setup({
        fiscalConfigRepository: { findByRestaurantId: jest.fn().mockResolvedValue(buildConfig({ environment: 'producao', productionEnabled: false })) },
      });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/orders/:id/fiscal/retry'], { restaurantId: 'r-1', params: { id: 'o-1' } }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow();
      expect(fiscalEmissionService.retryEmission).not.toHaveBeenCalled();
    });
  });

  describe('POST .../fiscal/cancel (REQ-6)', () => {
    it('AC-5: solicita o cancelamento de uma nota já emitida', async () => {
      const { fiscalEmissionService, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ fiscal: { status: 'emitido', ref: 'o-1' } })) },
      });
      const json = jest.fn();

      await runOperatorChain(
        routes['POST /restaurants/me/orders/:id/fiscal/cancel'],
        { restaurantId: 'r-1', params: { id: 'o-1' }, body: { justificativa: 'Cliente cancelou o pedido após a emissão' } },
        { json, send: jest.fn() },
      );

      expect(fiscalEmissionService.cancelDocument).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'o-1' }),
        expect.objectContaining({ restaurantId: 'r-1' }),
        'Cliente cancelou o pedido após a emissão',
      );
      expect(json).toHaveBeenCalled();
    });

    it('AC-5: pedido sem nota emitida rejeita o cancelamento (409)', async () => {
      const { fiscalEmissionService, routes } = setup();

      await expect(
        runOperatorChain(
          routes['POST /restaurants/me/orders/:id/fiscal/cancel'],
          { restaurantId: 'r-1', params: { id: 'o-1' }, body: { justificativa: 'Cliente cancelou o pedido após a emissão' } },
          { json: jest.fn(), send: jest.fn() },
        ),
      ).rejects.toThrow();
      expect(fiscalEmissionService.cancelDocument).not.toHaveBeenCalled();
    });

    it('rejeita corpo sem justificativa (ou fora da faixa de 15-255 caracteres exigida pela FocusNFe)', async () => {
      const { routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ fiscal: { status: 'emitido', ref: 'o-1' } })) },
      });

      await expect(
        runOperatorChain(
          routes['POST /restaurants/me/orders/:id/fiscal/cancel'],
          { restaurantId: 'r-1', params: { id: 'o-1' }, body: { justificativa: 'curto' } },
          { json: jest.fn(), send: jest.fn() },
        ),
      ).rejects.toThrow();
    });
  });
});
