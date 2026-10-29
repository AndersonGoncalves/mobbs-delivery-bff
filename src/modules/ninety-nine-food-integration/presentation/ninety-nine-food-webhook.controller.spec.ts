import { createHash } from 'crypto';
import type { Request, Response, Server } from 'restify';

import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { NinetyNineFoodAuthService } from '../infra/ninety-nine-food-auth.service';
import { NinetyNineFoodWebhookController } from './ninety-nine-food-webhook.controller';

const APP_SECRET = 'app-secret-1';

type FakeRequest = Partial<Pick<Request, 'rawBody'>> & { header: (name: string) => string | undefined };
type FakeResponse = Pick<Response, 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = { post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; } };
  return { application: application as unknown as Server, routes };
}

function signedRequest(rawBody: string, secret = APP_SECRET): FakeRequest {
  const signature = createHash('md5').update(rawBody + secret).digest('hex');
  return { rawBody, header: (name: string) => (name === 'didi-header-sign' ? signature : undefined) };
}

function buildRestaurant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'restaurant-1',
    name: 'Restaurante 1',
    ninetyNineFoodAppShopId: 'shop-1',
    ninetyNineFoodAuthToken: 'token-1',
    ...overrides,
  };
}

describe('NinetyNineFoodWebhookController (specs/0122-integracao-99food REQ-1/REQ-2/REQ-4)', () => {
  function setup(overrides: {
    restaurantRepository?: Partial<IRestaurantRepository>;
    customerRepository?: Partial<ICustomerRepository>;
    orderRepository?: Partial<IOrderRepository>;
    ninetyNineFoodAuthService?: Partial<NinetyNineFoodAuthService>;
    ordersController?: { markDeliveredViaExternalCourier: jest.Mock };
  } = {}) {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findOldestPendingNinetyNineFoodAuthorization: jest.fn().mockResolvedValue(buildRestaurant()),
      saveNinetyNineFoodBinding: jest.fn().mockResolvedValue(buildRestaurant()),
      findByNinetyNineFoodAppShopId: jest.fn().mockResolvedValue(buildRestaurant()),
      ...overrides.restaurantRepository,
    };
    const customerRepository: Partial<ICustomerRepository> = {
      createStandalone: jest.fn().mockResolvedValue({ id: 'customer-1', name: 'Ana' }),
      ...overrides.customerRepository,
    };
    const orderRepository: Partial<IOrderRepository> = {
      create: jest.fn().mockResolvedValue({ id: 'order-1' }),
      findByNinetyNineFoodOrderId: jest.fn().mockResolvedValue(null),
      updateEntregaDelivery: jest.fn().mockResolvedValue({ id: 'order-1', restaurantId: 'restaurant-1' }),
      ...overrides.orderRepository,
    };
    const ninetyNineFoodAuthService: Partial<NinetyNineFoodAuthService> = {
      getAuthtokenForNewBinding: jest.fn().mockResolvedValue({ authToken: 'token-novo', tokenExpiresAt: '2026-11-05T00:00:00.000Z' }),
      ...overrides.ninetyNineFoodAuthService,
    };
    const ordersController = overrides.ordersController ?? { markDeliveredViaExternalCourier: jest.fn().mockResolvedValue(undefined) };

    const { application, routes } = buildApp();
    new NinetyNineFoodWebhookController(
      restaurantRepository as IRestaurantRepository,
      customerRepository as ICustomerRepository,
      orderRepository as IOrderRepository,
      ninetyNineFoodAuthService as NinetyNineFoodAuthService,
      APP_SECRET,
      ordersController,
    ).initializeRoutes(application);

    return { restaurantRepository, customerRepository, orderRepository, ninetyNineFoodAuthService, ordersController, routes };
  }

  it('assinatura inválida responde 401 sem processar o payload', async () => {
    const { orderRepository, routes } = setup();
    const send = jest.fn();
    const req: FakeRequest = { rawBody: '{"type":"orderNew"}', header: () => 'assinatura-errada' };

    await routes['POST /webhooks/99food'][0](req, { send });

    expect(send).toHaveBeenCalledWith(401);
    expect(orderRepository.create).not.toHaveBeenCalled();
  });

  it('sem header de assinatura responde 401', async () => {
    const { routes } = setup();
    const send = jest.fn();
    const req: FakeRequest = { rawBody: '{"type":"orderNew"}', header: () => undefined };

    await routes['POST /webhooks/99food'][0](req, { send });

    expect(send).toHaveBeenCalledWith(401);
  });

  describe('shopBindStatus', () => {
    it('bindStatus "bind" casa com o restaurante de autorização pendente mais antiga e persiste o auth_token', async () => {
      const { restaurantRepository, ninetyNineFoodAuthService, routes } = setup();
      const rawBody = JSON.stringify({
        app_id: '123',
        type: 'shopBindStatus',
        timestamp: 1760678329,
        data: { appShopIDList: ['shop-novo-1'], bindStatus: 'bind' },
      });
      const send = jest.fn();

      await routes['POST /webhooks/99food'][0](signedRequest(rawBody), { send });

      expect(restaurantRepository.findOldestPendingNinetyNineFoodAuthorization).toHaveBeenCalled();
      expect(ninetyNineFoodAuthService.getAuthtokenForNewBinding).toHaveBeenCalledWith('shop-novo-1');
      expect(restaurantRepository.saveNinetyNineFoodBinding).toHaveBeenCalledWith('restaurant-1', {
        appShopId: 'shop-novo-1',
        authToken: 'token-novo',
        tokenExpiresAt: '2026-11-05T00:00:00.000Z',
      });
      expect(send).toHaveBeenCalledWith(200);
    });

    it('bindStatus "unbind" não persiste nada', async () => {
      const { restaurantRepository, routes } = setup();
      const rawBody = JSON.stringify({ app_id: '123', type: 'shopBindStatus', timestamp: 1, data: { appShopIDList: ['shop-1'], bindStatus: 'unbind' } });
      const send = jest.fn();

      await routes['POST /webhooks/99food'][0](signedRequest(rawBody), { send });

      expect(restaurantRepository.saveNinetyNineFoodBinding).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledWith(200);
    });

    it('sem nenhum restaurante pendente, responde 200 sem erro (nada pra casar)', async () => {
      const { restaurantRepository, routes } = setup({
        restaurantRepository: { findOldestPendingNinetyNineFoodAuthorization: jest.fn().mockResolvedValue(null) },
      });
      const rawBody = JSON.stringify({ app_id: '123', type: 'shopBindStatus', timestamp: 1, data: { appShopIDList: ['shop-1'], bindStatus: 'bind' } });
      const send = jest.fn();

      await routes['POST /webhooks/99food'][0](signedRequest(rawBody), { send });

      expect(restaurantRepository.saveNinetyNineFoodBinding).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledWith(200);
    });
  });

  describe('orderNew', () => {
    it('cria o Order interno com source 99food e preserva o order_id de 64 bits como string', async () => {
      const { customerRepository, orderRepository, routes } = setup();
      // order_id escrito como texto no JSON (não via JSON.stringify de um literal numérico JS —
      // o literal já seria arredondado pelo V8 antes mesmo de chegar ao JSON.stringify).
      const rawBody =
        '{"app_id":"123","app_shop_id":"shop-1","type":"orderNew","timestamp":1615432308,' +
        '"data":{"order_id":5764656197621845665,"order_info":{"order_id":5764656197621845665,' +
        '"fulfillment_mode":0,"price":{"order_price":2000,"real_pay_price":2500},' +
        '"receive_address":{"name":"Ana","phone":"11999998888","poi_address":"Rua X, 1"},' +
        '"order_items":[{"app_item_id":"item-1","name":"X-Burguer","amount":1,"sku_price":2000}]}}}';
      const send = jest.fn();

      await routes['POST /webhooks/99food'][0](signedRequest(rawBody), { send });

      expect(customerRepository.createStandalone).toHaveBeenCalledWith('Ana', '11999998888');
      expect(orderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurantId: 'restaurant-1',
          customerId: 'customer-1',
          source: '99food',
          ninetyNineFoodOrderId: '5764656197621845665',
        }),
      );
      expect(send).toHaveBeenCalledWith(200);
    });

    it('app_shop_id sem restaurante vinculado responde 200 sem criar pedido', async () => {
      const { orderRepository, routes } = setup({
        restaurantRepository: { findByNinetyNineFoodAppShopId: jest.fn().mockResolvedValue(null) },
      });
      const rawBody = JSON.stringify({
        app_id: '123',
        app_shop_id: 'shop-desconhecida',
        type: 'orderNew',
        timestamp: 1,
        data: { order_id: 1, order_info: { order_id: '1', fulfillment_mode: 0, price: { order_price: 100 }, order_items: [] } },
      });
      const send = jest.fn();

      await routes['POST /webhooks/99food'][0](signedRequest(rawBody), { send });

      expect(orderRepository.create).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledWith(200);
    });
  });

  describe('deliveryStatus (specs/0130-integracao-99-entrega REQ-5/REQ-7)', () => {
    function buildOrderWithEntrega(overrides: Record<string, unknown> = {}) {
      return {
        id: 'order-1',
        restaurantId: 'restaurant-1',
        entregaDelivery: { status: 'aceito', entregaOrderId: 'entrega-1', estimateId: 'estimate-1', fee: 600 },
        ...overrides,
      };
    }

    it('delivery_status 160 (FINISH) marca entregaDelivery.status "entregue" e chama markDeliveredViaExternalCourier', async () => {
      const { orderRepository, ordersController, routes } = setup({
        orderRepository: { findByNinetyNineFoodOrderId: jest.fn().mockResolvedValue(buildOrderWithEntrega()) },
      });
      const rawBody = JSON.stringify({ app_id: '123', type: 'deliveryStatus', timestamp: 1, data: { order_id: 1, delivery_status: 160 } });
      const send = jest.fn();

      await routes['POST /webhooks/99food'][0](signedRequest(rawBody), { send });

      expect(orderRepository.updateEntregaDelivery).toHaveBeenCalledWith('order-1', expect.objectContaining({ status: 'entregue' }));
      expect(ordersController.markDeliveredViaExternalCourier).toHaveBeenCalledWith('order-1', 'restaurant-1');
      expect(send).toHaveBeenCalledWith(200);
    });

    it('delivery_status 140 (TAKEN) marca "a_caminho" sem chamar markDeliveredViaExternalCourier', async () => {
      const { orderRepository, ordersController, routes } = setup({
        orderRepository: { findByNinetyNineFoodOrderId: jest.fn().mockResolvedValue(buildOrderWithEntrega()) },
      });
      const rawBody = JSON.stringify({ app_id: '123', type: 'deliveryStatus', timestamp: 1, data: { order_id: 1, delivery_status: 140 } });
      const send = jest.fn();

      await routes['POST /webhooks/99food'][0](signedRequest(rawBody), { send });

      expect(orderRepository.updateEntregaDelivery).toHaveBeenCalledWith('order-1', expect.objectContaining({ status: 'a_caminho' }));
      expect(ordersController.markDeliveredViaExternalCourier).not.toHaveBeenCalled();
    });

    it('delivery_status 170 (CANCEL) marca "cancelado" sem marcar entregue', async () => {
      const { orderRepository, ordersController, routes } = setup({
        orderRepository: { findByNinetyNineFoodOrderId: jest.fn().mockResolvedValue(buildOrderWithEntrega()) },
      });
      const rawBody = JSON.stringify({ app_id: '123', type: 'deliveryStatus', timestamp: 1, data: { order_id: 1, delivery_status: 170 } });
      const send = jest.fn();

      await routes['POST /webhooks/99food'][0](signedRequest(rawBody), { send });

      expect(orderRepository.updateEntregaDelivery).toHaveBeenCalledWith('order-1', expect.objectContaining({ status: 'cancelado' }));
      expect(ordersController.markDeliveredViaExternalCourier).not.toHaveBeenCalled();
    });

    it('pedido sem entregaDelivery (entrega da própria 99Food, nunca despachada por nós) não faz nada', async () => {
      const { orderRepository, routes } = setup({
        orderRepository: { findByNinetyNineFoodOrderId: jest.fn().mockResolvedValue({ id: 'order-2', restaurantId: 'restaurant-1' }) },
      });
      const rawBody = JSON.stringify({ app_id: '123', type: 'deliveryStatus', timestamp: 1, data: { order_id: 1, delivery_status: 160 } });
      const send = jest.fn();

      await routes['POST /webhooks/99food'][0](signedRequest(rawBody), { send });

      expect(orderRepository.updateEntregaDelivery).not.toHaveBeenCalled();
      expect(send).toHaveBeenCalledWith(200);
    });

    it('order_id desconhecido responde 200 sem erro', async () => {
      const { routes } = setup({ orderRepository: { findByNinetyNineFoodOrderId: jest.fn().mockResolvedValue(null) } });
      const rawBody = JSON.stringify({ app_id: '123', type: 'deliveryStatus', timestamp: 1, data: { order_id: 1, delivery_status: 160 } });
      const send = jest.fn();

      await routes['POST /webhooks/99food'][0](signedRequest(rawBody), { send });

      expect(send).toHaveBeenCalledWith(200);
    });
  });

  it('type desconhecido/fora de escopo v1 (ex. orderReady) responde 200 sem efeito', async () => {
    const { orderRepository, routes } = setup();
    const rawBody = JSON.stringify({ app_id: '123', app_shop_id: 'shop-1', type: 'orderReady', timestamp: 1, data: { order_id: 1 } });
    const send = jest.fn();

    await routes['POST /webhooks/99food'][0](signedRequest(rawBody), { send });

    expect(orderRepository.create).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(200);
  });

  it('erro inesperado processando o payload ainda responde 200 (nunca faz a 99Food reentregar)', async () => {
    const { routes } = setup({
      restaurantRepository: { findByNinetyNineFoodAppShopId: jest.fn().mockRejectedValue(new Error('boom')) },
    });
    const rawBody = JSON.stringify({
      app_id: '123',
      app_shop_id: 'shop-1',
      type: 'orderNew',
      timestamp: 1,
      data: { order_id: 1, order_info: { order_id: '1', fulfillment_mode: 0, price: { order_price: 100 }, order_items: [] } },
    });
    const send = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await routes['POST /webhooks/99food'][0](signedRequest(rawBody), { send });

    expect(send).toHaveBeenCalledWith(200);
  });
});
