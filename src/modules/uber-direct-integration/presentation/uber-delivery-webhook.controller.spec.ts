import type { Request, Response, Server } from 'restify';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IUberDeliveryConfigRepository } from '../domain/repositories/uber-delivery-config.repository.interface';
import { IUberDeliveryConfig } from '../domain/entities/uber-delivery-config.entity';
import { UberDeliveryWebhookController } from './uber-delivery-webhook.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'query'>>;
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = { post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; } };
  return { application: application as unknown as Server, routes };
}

function buildReq(token: string | undefined, body: unknown, restaurantId = 'r-1'): FakeRequest {
  return { params: { restaurantId }, body, query: { token } };
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o-1', orderNumber: 1, customerId: 'c-1', restaurantId: 'r-1', items: [], orderType: 'delivery',
    status: 'saiuParaEntrega', statusHistory: [], subtotal: 30, deliveryFee: 5, discount: 0, total: 35,
    paymentMethod: 'pix', createdAt: new Date().toISOString(),
    uberDelivery: { status: 'a_caminho', deliveryId: 'del-1', quoteId: 'quote-1' },
    ...overrides,
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

describe('UberDeliveryWebhookController (specs/0121-integracao-uber-entregas REQ-3/REQ-6)', () => {
  function setup(overrides: {
    uberDeliveryConfigRepository?: Partial<IUberDeliveryConfigRepository>;
    orderRepository?: Partial<IOrderRepository>;
    ordersController?: { markDeliveredViaExternalCourier: jest.Mock };
  } = {}) {
    const uberDeliveryConfigRepository: Partial<IUberDeliveryConfigRepository> = {
      findByRestaurantId: jest.fn().mockResolvedValue(buildConfig()),
      ...overrides.uberDeliveryConfigRepository,
    };
    const orderRepository: Partial<IOrderRepository> = {
      findByUberDeliveryId: jest.fn().mockResolvedValue(buildOrder()),
      updateUberDelivery: jest.fn().mockResolvedValue(buildOrder()),
      ...overrides.orderRepository,
    };
    const ordersController = overrides.ordersController ?? { markDeliveredViaExternalCourier: jest.fn().mockResolvedValue(undefined) };
    const { application, routes } = buildApp();
    new UberDeliveryWebhookController(
      uberDeliveryConfigRepository as IUberDeliveryConfigRepository,
      orderRepository as IOrderRepository,
      ordersController,
    ).initializeRoutes(application);
    return { uberDeliveryConfigRepository, orderRepository, ordersController, routes };
  }

  it('AC-3: status "dropoff" atualiza Order.uberDelivery pra "a_caminho", sem tentar mudar Order.status', async () => {
    const { orderRepository, ordersController, routes } = setup();
    const send = jest.fn();

    await routes['POST /webhooks/uber-direct/:restaurantId'][0](
      buildReq('webhook-token-1', { delivery_id: 'del-1', status: 'dropoff' }),
      { json: jest.fn(), send },
    );

    expect(orderRepository.updateUberDelivery).toHaveBeenCalledWith('o-1', expect.objectContaining({ status: 'a_caminho', deliveryId: 'del-1' }));
    expect(ordersController.markDeliveredViaExternalCourier).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(200);
  });

  it('AC-5/REQ-6: status "delivered" atualiza Order.uberDelivery pra "entregue" E aciona a transição de Order.status', async () => {
    const { orderRepository, ordersController, routes } = setup();
    const send = jest.fn();

    await routes['POST /webhooks/uber-direct/:restaurantId'][0](
      buildReq('webhook-token-1', { delivery_id: 'del-1', status: 'delivered' }),
      { json: jest.fn(), send },
    );

    expect(orderRepository.updateUberDelivery).toHaveBeenCalledWith('o-1', expect.objectContaining({ status: 'entregue' }));
    expect(ordersController.markDeliveredViaExternalCourier).toHaveBeenCalledWith('o-1', 'r-1');
    expect(send).toHaveBeenCalledWith(200);
  });

  it('token inválido/ausente rejeita com 401', async () => {
    const { routes } = setup();

    await expect(
      routes['POST /webhooks/uber-direct/:restaurantId'][0](buildReq('token-errado', { delivery_id: 'del-1', status: 'delivered' }), { json: jest.fn(), send: jest.fn() }),
    ).rejects.toThrow();
  });

  it('delivery_id desconhecido (pedido não encontrado) responde 200 sem erro', async () => {
    const { ordersController, routes } = setup({ orderRepository: { findByUberDeliveryId: jest.fn().mockResolvedValue(null) } });
    const send = jest.fn();

    await routes['POST /webhooks/uber-direct/:restaurantId'][0](buildReq('webhook-token-1', { delivery_id: 'del-desconhecido', status: 'delivered' }), { json: jest.fn(), send });

    expect(ordersController.markDeliveredViaExternalCourier).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(200);
  });

  it('payload sem delivery_id/status responde 200 sem erro', async () => {
    const { orderRepository, routes } = setup();
    const send = jest.fn();

    await routes['POST /webhooks/uber-direct/:restaurantId'][0](buildReq('webhook-token-1', {}), { json: jest.fn(), send });

    expect(orderRepository.updateUberDelivery).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(200);
  });
});
