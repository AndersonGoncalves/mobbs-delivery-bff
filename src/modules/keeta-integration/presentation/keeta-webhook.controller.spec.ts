import type { Request, Response, Server } from 'restify';

import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { computeKeetaSignature } from '../domain/keeta-signature';
import { KeetaWebhookController } from './keeta-webhook.controller';

const APP_SECRET = 'app-secret-1';
const WEBHOOK_URL = 'https://api.bsdelivery.com.br/webhooks/keeta';

type FakeRequest = Partial<Pick<Request, 'body'>>;
type FakeResponse = Pick<Response, 'send' | 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = { post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; } };
  return { application: application as unknown as Server, routes };
}

function signedBody(payload: Record<string, unknown>, secret = APP_SECRET) {
  const params: Record<string, string> = Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]),
  );
  const sig = computeKeetaSignature(WEBHOOK_URL, params, secret);
  return { ...payload, sig };
}

function buildRestaurant(overrides: Record<string, unknown> = {}) {
  return { id: 'restaurant-1', name: 'Restaurante 1', keetaShopId: 'shop-1', ...overrides };
}

function buildOrderInfo() {
  return {
    baseOrder: { orderViewId: 'order-view-1' },
    merchantOrder: { status: 10, userGetMode: 'delivery' },
    recipientInfo: { name: 'Ana', phone: '11999990000', addressName: 'Rua 1' },
    feeDtl: { customerFee: 5000 },
    products: [{ name: 'Item', count: 1, price: 5000 }],
  };
}

describe('KeetaWebhookController (specs/0212-integracao-keeta REQ-3/REQ-4)', () => {
  function setup(overrides: {
    restaurantRepository?: Partial<IRestaurantRepository>;
    customerRepository?: Partial<ICustomerRepository>;
    orderRepository?: Partial<IOrderRepository>;
  } = {}) {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findByKeetaShopId: jest.fn().mockResolvedValue(buildRestaurant()),
      disconnectAllByKeetaBrandId: jest.fn().mockResolvedValue(undefined),
      ...overrides.restaurantRepository,
    };
    const customerRepository: Partial<ICustomerRepository> = {
      createStandalone: jest.fn().mockResolvedValue({ id: 'customer-1', name: 'Ana' }),
      ...overrides.customerRepository,
    };
    const orderRepository: Partial<IOrderRepository> = {
      create: jest.fn().mockResolvedValue({ id: 'order-1' }),
      findByKeetaOrderViewId: jest.fn().mockResolvedValue(null),
      ...overrides.orderRepository,
    };

    const { application, routes } = buildApp();
    new KeetaWebhookController(
      restaurantRepository as IRestaurantRepository,
      customerRepository as ICustomerRepository,
      orderRepository as IOrderRepository,
      APP_SECRET,
      WEBHOOK_URL,
    ).initializeRoutes(application);
    return { restaurantRepository, customerRepository, orderRepository, routes };
  }

  async function post(routes: Record<string, RouteHandler[]>, body: FakeRequest['body'], res: FakeResponse) {
    const handler = routes['POST /webhooks/keeta'][1]; // [webhookRateLimitMiddleware, handler]
    await handler({ body }, res);
  }

  it('401 quando a assinatura não bate', async () => {
    const { routes } = setup();
    const send = jest.fn();

    await post(routes, { eventType: 1001, shopId: 'shop-1', data: buildOrderInfo(), sig: 'sig-errada' }, { send, json: jest.fn() });

    expect(send).toHaveBeenCalledWith(401);
  });

  it('AC-2: evento 1001 (orderPlacedNotification) cria o Order e responde ACK', async () => {
    const { routes, orderRepository, customerRepository } = setup();
    const json = jest.fn();

    await post(routes, signedBody({ eventType: 1001, shopId: 'shop-1', data: buildOrderInfo() }), { send: jest.fn(), json });

    expect(customerRepository.createStandalone).toHaveBeenCalledWith('Ana', '11999990000');
    expect(orderRepository.create).toHaveBeenCalledWith(expect.objectContaining({ source: 'keeta', keetaOrderViewId: 'order-view-1', restaurantId: 'restaurant-1' }));
    expect(json).toHaveBeenCalledWith(200, { code: 0, message: 'success' });
  });

  it('deduplica reentregas do evento 1001 (mesmo orderViewId já existente)', async () => {
    const { routes, orderRepository } = setup({ orderRepository: { findByKeetaOrderViewId: jest.fn().mockResolvedValue({ id: 'order-1' }) } });
    const json = jest.fn();

    await post(routes, signedBody({ eventType: 1001, shopId: 'shop-1', data: buildOrderInfo() }), { send: jest.fn(), json });

    expect(orderRepository.create).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, { code: 0, message: 'success' });
  });

  it('evento 1001 sem restaurante vinculado ao shopId: não cria pedido, ainda responde ACK', async () => {
    const { routes, orderRepository } = setup({ restaurantRepository: { findByKeetaShopId: jest.fn().mockResolvedValue(null) } });
    const json = jest.fn();

    await post(routes, signedBody({ eventType: 1001, shopId: 'shop-desconhecido', data: buildOrderInfo() }), { send: jest.fn(), json });

    expect(orderRepository.create).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, { code: 0, message: 'success' });
  });

  it('evento 1303 (revogação de marca) desconecta todos os restaurantes do brandId', async () => {
    const { routes, restaurantRepository } = setup();
    const json = jest.fn();

    await post(routes, signedBody({ eventType: 1303, brandId: 'brand-1' }), { send: jest.fn(), json });

    expect(restaurantRepository.disconnectAllByKeetaBrandId).toHaveBeenCalledWith('brand-1');
    expect(json).toHaveBeenCalledWith(200, { code: 0, message: 'success' });
  });

  it('eventos sem efeito nesta v1 (ex. 1101) respondem ACK sem chamar nenhum repositório', async () => {
    const { routes, orderRepository, restaurantRepository } = setup();
    const json = jest.fn();

    await post(routes, signedBody({ eventType: 1101, shopId: 'shop-1' }), { send: jest.fn(), json });

    expect(orderRepository.create).not.toHaveBeenCalled();
    expect(restaurantRepository.disconnectAllByKeetaBrandId).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, { code: 0, message: 'success' });
  });
});
