import type { Request, Response, Server } from 'restify';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IUberDeliveryConfigRepository } from '../domain/repositories/uber-delivery-config.repository.interface';
import { IUberDeliveryConfig } from '../domain/entities/uber-delivery-config.entity';
import { UberDeliveryDispatchService } from '../domain/services/uber-delivery-dispatch.service';
import { UberDeliveryOrderActionsController } from './uber-delivery-order-actions.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { restaurantId?: string };
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = { post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; } };
  return { application: application as unknown as Server, routes };
}

async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse) {
  for (const handler of handlers.slice(3)) await handler(req, res);
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o-1', orderNumber: 1, customerId: 'c-1', restaurantId: 'r-1', items: [], orderType: 'delivery',
    status: 'emPreparo', statusHistory: [], subtotal: 30, deliveryFee: 5, discount: 0, total: 35,
    paymentMethod: 'pix', createdAt: new Date().toISOString(), ...overrides,
  };
}

function buildConfig(overrides: Partial<IUberDeliveryConfig> = {}): IUberDeliveryConfig {
  return {
    restaurantId: 'r-1',
    customerId: 'uber-customer-1',
    clientId: 'client-1',
    clientSecret: 'secret-1',
    originZipCode: '01000000',
    webhookToken: 'webhook-token-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('UberDeliveryOrderActionsController (specs/0121-integracao-uber-entregas REQ-2/REQ-4/REQ-5)', () => {
  function setup(overrides: {
    orderRepository?: Partial<IOrderRepository>;
    uberDeliveryConfigRepository?: Partial<IUberDeliveryConfigRepository>;
    uberDeliveryDispatchService?: Partial<UberDeliveryDispatchService>;
  } = {}) {
    const orderRepository: Partial<IOrderRepository> = {
      findById: jest.fn().mockResolvedValue(buildOrder()),
      ...overrides.orderRepository,
    };
    const uberDeliveryConfigRepository: Partial<IUberDeliveryConfigRepository> = {
      findByRestaurantId: jest.fn().mockResolvedValue(buildConfig()),
      ...overrides.uberDeliveryConfigRepository,
    };
    const uberDeliveryDispatchService: Partial<UberDeliveryDispatchService> = {
      dispatch: jest.fn().mockResolvedValue(buildOrder({ uberDelivery: { status: 'solicitado' } })),
      ...overrides.uberDeliveryDispatchService,
    };
    const { application, routes } = buildApp();
    new UberDeliveryOrderActionsController(
      orderRepository as IOrderRepository,
      uberDeliveryConfigRepository as IUberDeliveryConfigRepository,
      uberDeliveryDispatchService as UberDeliveryDispatchService,
      jest.fn(),
    ).initializeRoutes(application);
    return { orderRepository, uberDeliveryConfigRepository, uberDeliveryDispatchService, routes };
  }

  describe('POST .../uber-delivery/dispatch (REQ-2/REQ-4)', () => {
    it('AC-2: despacha um pedido de delivery em preparo, sem motoboy nem Uber já atribuídos', async () => {
      const { uberDeliveryDispatchService, routes } = setup();
      const json = jest.fn();

      await runOperatorChain(routes['POST /restaurants/me/orders/:id/uber-delivery/dispatch'], { restaurantId: 'r-1', params: { id: 'o-1' } }, { json, send: jest.fn() });

      expect(uberDeliveryDispatchService.dispatch).toHaveBeenCalled();
      expect(json).toHaveBeenCalled();
    });

    it('AC-4/REQ-5: cotação recusada pela Uber propaga o erro (pedido não é alterado)', async () => {
      const { routes } = setup({
        uberDeliveryDispatchService: { dispatch: jest.fn().mockRejectedValue(new Error('fora da área de cobertura')) },
      });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/orders/:id/uber-delivery/dispatch'], { restaurantId: 'r-1', params: { id: 'o-1' } }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow('fora da área de cobertura');
    });

    it('pedido de retirada (pickup) nunca pode ser despachado via Uber', async () => {
      const { uberDeliveryDispatchService, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ orderType: 'pickup' })) },
      });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/orders/:id/uber-delivery/dispatch'], { restaurantId: 'r-1', params: { id: 'o-1' } }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow();
      expect(uberDeliveryDispatchService.dispatch).not.toHaveBeenCalled();
    });

    it('pedido cancelado/entregue nunca pode ser despachado', async () => {
      const { uberDeliveryDispatchService, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ status: 'entregue' })) },
      });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/orders/:id/uber-delivery/dispatch'], { restaurantId: 'r-1', params: { id: 'o-1' } }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow();
      expect(uberDeliveryDispatchService.dispatch).not.toHaveBeenCalled();
    });

    it('pedido já com motoboy próprio atribuído rejeita o despacho via Uber (uma opção por pedido)', async () => {
      const { uberDeliveryDispatchService, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ deliveryMotoboy: { id: 'm-1', name: 'Zé' } })) },
      });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/orders/:id/uber-delivery/dispatch'], { restaurantId: 'r-1', params: { id: 'o-1' } }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow();
      expect(uberDeliveryDispatchService.dispatch).not.toHaveBeenCalled();
    });

    it('pedido já com entrega Uber despachada rejeita um segundo despacho', async () => {
      const { uberDeliveryDispatchService, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ uberDelivery: { status: 'solicitado' } })) },
      });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/orders/:id/uber-delivery/dispatch'], { restaurantId: 'r-1', params: { id: 'o-1' } }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow();
      expect(uberDeliveryDispatchService.dispatch).not.toHaveBeenCalled();
    });

    it('sem UberDeliveryConfig cadastrada rejeita o despacho', async () => {
      const { uberDeliveryDispatchService, routes } = setup({
        uberDeliveryConfigRepository: { findByRestaurantId: jest.fn().mockResolvedValue(null) },
      });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/orders/:id/uber-delivery/dispatch'], { restaurantId: 'r-1', params: { id: 'o-1' } }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow();
      expect(uberDeliveryDispatchService.dispatch).not.toHaveBeenCalled();
    });
  });
});
