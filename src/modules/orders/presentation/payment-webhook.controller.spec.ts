import type { Request, Response, Server } from 'restify';
import { IOrderRepository } from '../domain/repositories/order.repository.interface';
import { IPaymentRepository } from '../domain/repositories/payment.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IWhatsAppNotificationService } from '../../notifications/domain/services/i-whatsapp-notification.service';
import { PaymentWebhookController } from './payment-webhook.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { restaurantId?: string };
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; },
  };
  return { application: application as unknown as Server, routes };
}

// Rota do webhook: só 1 middleware (`paymentWebhookApiKeyMiddleware`) antes do handler.
async function runWebhookChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse) {
  for (const handler of handlers.slice(1)) await handler(req, res);
}

// Rota do operador: [firebaseAuthMiddleware, restaurantOperatorMiddleware, requireOperatorRole, handler].
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse) {
  for (const handler of handlers.slice(3)) await handler(req, res);
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o-1', orderNumber: 38, customerId: 'c-1', restaurantId: 'r-1', items: [], orderType: 'delivery',
    status: 'aguardandoConfirmacao', statusHistory: [], subtotal: 30, deliveryFee: 0, discount: 0, total: 30,
    paymentMethod: 'pix', createdAt: '2026-10-20T12:00:00.000Z', ...overrides,
  };
}

function buildPayment(overrides: Record<string, unknown> = {}) {
  return { id: 'pay-1', orderId: 'o-1', method: 'pix', status: 'pendente', amount: 30, ...overrides };
}

function buildRestaurant(overrides: Record<string, unknown> = {}) {
  return { id: 'r-1', name: 'Prime Pizza', paymentWebhookApiKey: 'key-1', ...overrides };
}

describe('PaymentWebhookController (specs/0140-confirmacao-automatica-pix REQ-1b)', () => {
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
      regeneratePaymentWebhookApiKey: jest.fn().mockResolvedValue(buildRestaurant({ paymentWebhookApiKey: 'new-key' })),
      ...overrides.restaurantRepository,
    };
    const whatsAppNotificationService: Partial<IWhatsAppNotificationService> = {
      sendPaymentConfirmedMessage: jest.fn().mockResolvedValue(undefined),
      sendOrderStatusUpdate: jest.fn().mockResolvedValue(undefined),
      ...overrides.whatsAppNotificationService,
    };
    const { application, routes } = buildApp();
    new PaymentWebhookController(
      orderRepository as IOrderRepository,
      paymentRepository as IPaymentRepository,
      restaurantRepository as IRestaurantRepository,
      whatsAppNotificationService as IWhatsAppNotificationService,
      jest.fn(),
      jest.fn(),
    ).initializeRoutes(application);
    return { orderRepository, paymentRepository, restaurantRepository, whatsAppNotificationService, routes };
  }

  it('AC-4: status "aprovado" com "pix" em autoConfirmPaymentMethods avança o pedido pra confirmado', async () => {
    const { paymentRepository, orderRepository, routes } = setup({
      restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ autoConfirmPaymentMethods: ['pix'] })) },
    });
    const json = jest.fn();

    await runWebhookChain(
      routes['POST /restaurants/me/payment-webhook/pix-confirmed'],
      { restaurantId: 'r-1', body: { orderId: 'o-1', status: 'aprovado' } },
      { json, send: jest.fn() },
    );

    expect(paymentRepository.markAsApproved).toHaveBeenCalledWith('o-1');
    expect(orderRepository.updateStatus).toHaveBeenCalledWith('o-1', 'confirmado', 'r-1');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'confirmado', payment: { method: 'pix', status: 'aprovado' } }));
  });

  it('sem "pix" em autoConfirmPaymentMethods, confirma só o pagamento (mesmo comportamento do REQ-1a)', async () => {
    const { orderRepository, routes } = setup();
    const json = jest.fn();

    await runWebhookChain(
      routes['POST /restaurants/me/payment-webhook/pix-confirmed'],
      { restaurantId: 'r-1', body: { orderId: 'o-1', status: 'aprovado' } },
      { json, send: jest.fn() },
    );

    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'aguardandoConfirmacao', payment: { method: 'pix', status: 'aprovado' } }));
  });

  it('status diferente de "aprovado" é um no-op (204), sem confirmar nada', async () => {
    const { paymentRepository, orderRepository, routes } = setup();
    const send = jest.fn();

    await runWebhookChain(
      routes['POST /restaurants/me/payment-webhook/pix-confirmed'],
      { restaurantId: 'r-1', body: { orderId: 'o-1', status: 'recusado' } },
      { json: jest.fn(), send },
    );

    expect(send).toHaveBeenCalledWith(204);
    expect(paymentRepository.markAsApproved).not.toHaveBeenCalled();
    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('pedido de outro restaurante é 404', async () => {
    const { routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ restaurantId: 'r-OUTRO' })) } });

    await expect(
      runWebhookChain(
        routes['POST /restaurants/me/payment-webhook/pix-confirmed'],
        { restaurantId: 'r-1', body: { orderId: 'o-1', status: 'aprovado' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('pedido sem pagamento Pix é 409', async () => {
    const { routes } = setup({ paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ method: 'cash' })) } });

    await expect(
      runWebhookChain(
        routes['POST /restaurants/me/payment-webhook/pix-confirmed'],
        { restaurantId: 'r-1', body: { orderId: 'o-1', status: 'aprovado' } },
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('reenvio pro mesmo pedido já aprovado é 200 idempotente (não re-confirma, não lança)', async () => {
    const { paymentRepository, orderRepository, routes } = setup({
      paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ status: 'aprovado' })) },
    });
    const json = jest.fn();

    await runWebhookChain(
      routes['POST /restaurants/me/payment-webhook/pix-confirmed'],
      { restaurantId: 'r-1', body: { orderId: 'o-1', status: 'aprovado' } },
      { json, send: jest.fn() },
    );

    expect(paymentRepository.markAsApproved).not.toHaveBeenCalled();
    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ payment: { method: 'pix', status: 'aprovado' } }));
  });

  it('POST .../payment-webhook/regenerate-key devolve uma chave nova', async () => {
    const { restaurantRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/payment-webhook/regenerate-key'],
      { restaurantId: 'r-1' },
      { json, send: jest.fn() },
    );

    expect(restaurantRepository.regeneratePaymentWebhookApiKey).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, { paymentWebhookApiKey: 'new-key' });
  });
});
