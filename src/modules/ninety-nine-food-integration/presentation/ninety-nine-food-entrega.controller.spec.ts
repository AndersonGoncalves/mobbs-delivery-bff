import type { Request, Response, Server } from 'restify';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { NinetyNineFoodEntregaDispatchService } from '../domain/services/ninety-nine-food-entrega-dispatch.service';
import { NinetyNineFoodClient } from '../infra/ninety-nine-food-client';
import { NinetyNineFoodEntregaController } from './ninety-nine-food-entrega.controller';

type FakeRequest = Partial<Pick<Request, 'params'>> & { restaurantId?: string };
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
    id: 'order-1',
    restaurantId: 'restaurant-1',
    orderType: 'delivery',
    source: '99food',
    status: 'emPreparo',
    ...overrides,
  };
}

function buildRestaurant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'restaurant-1',
    ninetyNineFoodAuthToken: 'token-abc',
    ninetyNineFoodEntregaActivatedAt: '2026-10-29T00:00:00.000Z',
    ...overrides,
  };
}

describe('NinetyNineFoodEntregaController (specs/0130-integracao-99-entrega REQ-1/REQ-8/REQ-9)', () => {
  function setup(overrides: {
    orderRepository?: Partial<IOrderRepository>;
    restaurantRepository?: Partial<IRestaurantRepository>;
    dispatchService?: { dispatch: jest.Mock };
    client?: Partial<NinetyNineFoodClient>;
  } = {}) {
    const orderRepository: Partial<IOrderRepository> = {
      findById: jest.fn().mockResolvedValue(buildOrder()),
      updateEntregaDelivery: jest.fn().mockResolvedValue(buildOrder({ entregaDelivery: { status: 'cancelado' } })),
      ...overrides.orderRepository,
    };
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue(buildRestaurant()),
      activateNinetyNineFoodEntrega: jest.fn().mockResolvedValue(buildRestaurant()),
      ...overrides.restaurantRepository,
    };
    const dispatchService = overrides.dispatchService ?? { dispatch: jest.fn().mockResolvedValue(buildOrder({ entregaDelivery: { status: 'solicitado' } })) };
    const client: Partial<NinetyNineFoodClient> = {
      activateEntregaService: jest.fn().mockResolvedValue(undefined),
      cancelEntregaOrder: jest.fn().mockResolvedValue(undefined),
      ...overrides.client,
    };

    const { application, routes } = buildApp();
    new NinetyNineFoodEntregaController(
      orderRepository as IOrderRepository,
      restaurantRepository as IRestaurantRepository,
      dispatchService as unknown as NinetyNineFoodEntregaDispatchService,
      client as NinetyNineFoodClient,
      jest.fn(),
    ).initializeRoutes(application);

    return { orderRepository, restaurantRepository, dispatchService, client, routes };
  }

  describe('ativar (AC-1)', () => {
    it('chama activateEntregaService e persiste ninetyNineFoodEntregaActivatedAt', async () => {
      const { client, restaurantRepository, routes } = setup();
      const json = jest.fn();

      await runOperatorChain(routes['POST /restaurants/me/99food/entrega/activate'], { restaurantId: 'restaurant-1' }, { json, send: jest.fn() });

      expect(client.activateEntregaService).toHaveBeenCalledWith('token-abc');
      expect(restaurantRepository.activateNinetyNineFoodEntrega).toHaveBeenCalledWith('restaurant-1');
      expect(json).toHaveBeenCalledWith(200, { activated: true });
    });

    it('rejeita sem integração 99Food conectada', async () => {
      const { routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ ninetyNineFoodAuthToken: undefined })) } });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/99food/entrega/activate'], { restaurantId: 'restaurant-1' }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow();
    });
  });

  describe('despachar (AC-2/AC-7)', () => {
    it('AC-2: despacha um pedido elegível', async () => {
      const { dispatchService, routes } = setup();
      const json = jest.fn();

      await runOperatorChain(routes['POST /restaurants/me/orders/:id/99food-entrega/dispatch'], { restaurantId: 'restaurant-1', params: { id: 'order-1' } }, { json, send: jest.fn() });

      expect(dispatchService.dispatch).toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith(200, expect.anything());
    });

    it('AC-7: recusa pedido que não seja de origem 99food', async () => {
      const { dispatchService, routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ source: undefined })) } });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/orders/:id/99food-entrega/dispatch'], { restaurantId: 'restaurant-1', params: { id: 'order-1' } }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow();
      expect(dispatchService.dispatch).not.toHaveBeenCalled();
    });

    it('AC-7: recusa pedido de retirada (pickup)', async () => {
      const { routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ orderType: 'pickup' })) } });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/orders/:id/99food-entrega/dispatch'], { restaurantId: 'restaurant-1', params: { id: 'order-1' } }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow();
    });

    it('AC-7: recusa pedido já cancelado', async () => {
      const { routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ status: 'cancelado' })) } });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/orders/:id/99food-entrega/dispatch'], { restaurantId: 'restaurant-1', params: { id: 'order-1' } }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow();
    });

    it('AC-7: recusa pedido que já tem entrega 99 Entrega despachada', async () => {
      const { routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ entregaDelivery: { status: 'solicitado' } })) } });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/orders/:id/99food-entrega/dispatch'], { restaurantId: 'restaurant-1', params: { id: 'order-1' } }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow();
    });

    it('AC-7: recusa pedido de outro restaurante', async () => {
      const { routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ restaurantId: 'outro' })) } });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/orders/:id/99food-entrega/dispatch'], { restaurantId: 'restaurant-1', params: { id: 'order-1' } }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow();
    });

    it('recusa quando o 99 Entrega não foi ativado', async () => {
      const { routes } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ ninetyNineFoodEntregaActivatedAt: undefined })) } });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/orders/:id/99food-entrega/dispatch'], { restaurantId: 'restaurant-1', params: { id: 'order-1' } }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow();
    });
  });

  describe('cancelar (AC-8)', () => {
    it('chama cancelEntregaOrder e persiste status cancelado', async () => {
      const { client, orderRepository, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ entregaDelivery: { status: 'solicitado', entregaOrderId: 'entrega-99' } })) },
      });
      const json = jest.fn();

      await runOperatorChain(routes['POST /restaurants/me/orders/:id/99food-entrega/cancel'], { restaurantId: 'restaurant-1', params: { id: 'order-1' } }, { json, send: jest.fn() });

      expect(client.cancelEntregaOrder).toHaveBeenCalledWith('token-abc', { entregaOrderId: 'entrega-99' });
      expect(orderRepository.updateEntregaDelivery).toHaveBeenCalledWith('order-1', { status: 'cancelado', entregaOrderId: 'entrega-99' });
      expect(json).toHaveBeenCalledWith(200, expect.anything());
    });

    it('rejeita pedido sem entrega 99 Entrega ativa', async () => {
      const { routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ entregaDelivery: undefined })) } });

      await expect(
        runOperatorChain(routes['POST /restaurants/me/orders/:id/99food-entrega/cancel'], { restaurantId: 'restaurant-1', params: { id: 'order-1' } }, { json: jest.fn(), send: jest.fn() }),
      ).rejects.toThrow();
    });
  });
});
