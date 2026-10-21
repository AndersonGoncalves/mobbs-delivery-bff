import type { Request, Response, Server } from 'restify';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IPaymentRepository } from '../../orders/domain/repositories/payment.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IWhatsAppNotificationService } from '../../notifications/domain/services/i-whatsapp-notification.service';
import { AsaasWebhookController } from './asaas-webhook.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { header?: (name: string) => string | undefined };
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = { post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; } };
  return { application: application as unknown as Server, routes };
}

function buildReq(token: string | undefined, body: unknown, restaurantId = 'r-1'): FakeRequest {
  return { params: { restaurantId }, body, header: (name: string) => (name === 'asaas-access-token' ? token : undefined) };
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o-1', orderNumber: 1, customerId: 'c-1', restaurantId: 'r-1', items: [], orderType: 'delivery',
    status: 'aguardandoConfirmacao', statusHistory: [], subtotal: 30, deliveryFee: 0, discount: 0, total: 30,
    paymentMethod: 'pix', createdAt: new Date().toISOString(), ...overrides,
  };
}

function buildPayment(overrides: Record<string, unknown> = {}) {
  return { id: 'pay-1', orderId: 'o-1', method: 'pix', status: 'pendente', amount: 30, ...overrides };
}

function buildRestaurant(overrides: Record<string, unknown> = {}) {
  return { id: 'r-1', name: 'Prime Pizza', asaasWebhookToken: 'webhook-token-1', ...overrides };
}

describe('AsaasWebhookController (specs/0101-integracao-asaas, fase 1)', () => {
  function setup(overrides: {
    orderRepository?: Partial<IOrderRepository>;
    paymentRepository?: Partial<IPaymentRepository>;
    restaurantRepository?: Partial<IRestaurantRepository>;
    whatsAppNotificationService?: Partial<IWhatsAppNotificationService>;
  } = {}) {
    const orderRepository: Partial<IOrderRepository> = {
      findById: jest.fn().mockResolvedValue(buildOrder()),
      updateStatus: jest.fn().mockImplementation((id, status) => Promise.resolve(buildOrder({ id, status }))),
      ...overrides.orderRepository,
    };
    const paymentRepository: Partial<IPaymentRepository> = {
      findByOrderId: jest.fn().mockResolvedValue(buildPayment()),
      markAsApproved: jest.fn().mockResolvedValue(buildPayment({ status: 'aprovado' })),
      ...overrides.paymentRepository,
    };
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue(buildRestaurant()),
      ...overrides.restaurantRepository,
    };
    const whatsAppNotificationService: Partial<IWhatsAppNotificationService> = {
      sendPaymentConfirmedMessage: jest.fn().mockResolvedValue(undefined),
      sendOrderStatusUpdate: jest.fn().mockResolvedValue(undefined),
      ...overrides.whatsAppNotificationService,
    };
    const { application, routes } = buildApp();
    new AsaasWebhookController(
      orderRepository as IOrderRepository,
      paymentRepository as IPaymentRepository,
      restaurantRepository as IRestaurantRepository,
      whatsAppNotificationService as IWhatsAppNotificationService,
    ).initializeRoutes(application);
    return { orderRepository, paymentRepository, restaurantRepository, routes };
  }

  it('AC-4: PAYMENT_CONFIRMED com token válido confirma o pagamento (mesmo resultado da confirmação manual)', async () => {
    const { paymentRepository, routes } = setup();
    const json = jest.fn();

    await routes['POST /webhooks/asaas/:restaurantId'][0](
      buildReq('webhook-token-1', { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1', externalReference: 'o-1' } }),
      { json, send: jest.fn() },
    );

    expect(paymentRepository.markAsApproved).toHaveBeenCalledWith('o-1');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ payment: { method: 'pix', status: 'aprovado' } }));
  });

  it('token ausente ou inválido é 401', async () => {
    const { routes } = setup();

    await expect(
      routes['POST /webhooks/asaas/:restaurantId'][0](
        buildReq('token-errado', { event: 'PAYMENT_CONFIRMED', payment: { externalReference: 'o-1' } }),
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('evento que não é de pagamento confirmado é 200 no-op', async () => {
    const { paymentRepository, routes } = setup();
    const send = jest.fn();

    await routes['POST /webhooks/asaas/:restaurantId'][0](
      buildReq('webhook-token-1', { event: 'PAYMENT_OVERDUE', payment: { externalReference: 'o-1' } }),
      { json: jest.fn(), send },
    );

    expect(send).toHaveBeenCalledWith(200);
    expect(paymentRepository.markAsApproved).not.toHaveBeenCalled();
  });

  it('pedido de outro restaurante é 404', async () => {
    const { routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ restaurantId: 'r-OUTRO' })) } });

    await expect(
      routes['POST /webhooks/asaas/:restaurantId'][0](
        buildReq('webhook-token-1', { event: 'PAYMENT_CONFIRMED', payment: { externalReference: 'o-1' } }),
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('reenvio pro mesmo pedido já aprovado é 200 idempotente', async () => {
    const { paymentRepository, routes } = setup({ paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ status: 'aprovado' })) } });
    const json = jest.fn();

    await routes['POST /webhooks/asaas/:restaurantId'][0](
      buildReq('webhook-token-1', { event: 'PAYMENT_CONFIRMED', payment: { externalReference: 'o-1' } }),
      { json, send: jest.fn() },
    );

    expect(paymentRepository.markAsApproved).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ payment: { method: 'pix', status: 'aprovado' } }));
  });
});
