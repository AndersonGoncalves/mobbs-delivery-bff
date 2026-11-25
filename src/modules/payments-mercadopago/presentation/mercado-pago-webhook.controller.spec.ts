import { createHmac } from 'crypto';
import type { Request, Response, Server } from 'restify';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IPaymentRepository } from '../../orders/domain/repositories/payment.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IWhatsAppNotificationService } from '../../notifications/domain/services/i-whatsapp-notification.service';
import { MercadoPagoClient } from '../infra/mercado-pago-client';
import { MercadoPagoWebhookController } from './mercado-pago-webhook.controller';

jest.mock('../infra/mercado-pago-client');
jest.mock('../../../shared/config/environment', () => ({
  environment: {
    mercadoPago: {
      clientId: 'app-client-id', clientSecret: 'app-client-secret', baseUrl: 'https://api.mercadopago.com',
      webhookSecret: 'webhook-secret-1', platformAccessToken: 'platform-token-1',
    },
  },
}));

type FakeRequest = Partial<Pick<Request, 'body'>> & { header?: (name: string) => string | undefined };
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = { post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; } };
  return { application: application as unknown as Server, routes };
}

function signature(paymentId: string, requestId: string, ts: string, secret = 'webhook-secret-1') {
  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

// specs/0226 REQ-A4 — conta Mercado Pago (vendedora) dona do pagamento, vinculada ao restaurante r-1.
const SELLER_USER_ID = '3874969016';

function buildReq(paymentId: string, overrides: { xSignature?: string; xRequestId?: string; userId?: string | null } = {}): FakeRequest {
  const ts = '1700000000';
  const xRequestId = overrides.xRequestId ?? 'req-1';
  const xSignature = overrides.xSignature ?? signature(paymentId, xRequestId, ts);
  return {
    body: { type: 'payment', data: { id: paymentId }, ...(overrides.userId === null ? {} : { user_id: overrides.userId ?? SELLER_USER_ID }) },
    header: (name: string) => {
      if (name === 'x-signature') return xSignature;
      if (name === 'x-request-id') return xRequestId;
      return undefined;
    },
  };
}

function buildOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o-1', orderNumber: 1, customerId: 'c-1', restaurantId: 'r-1', items: [], orderType: 'delivery',
    status: 'aguardandoConfirmacao', statusHistory: [], subtotal: 30, deliveryFee: 0, discount: 0, total: 30,
    paymentMethod: 'creditCardOnline', createdAt: new Date().toISOString(), ...overrides,
  };
}

function buildPayment(overrides: Record<string, unknown> = {}) {
  return { id: 'pay-1', orderId: 'o-1', method: 'creditCardOnline', status: 'pendente', amount: 30, ...overrides };
}

describe('MercadoPagoWebhookController (specs/0170-integracao-mercado-pago)', () => {
  const MockedMercadoPagoClient = MercadoPagoClient as jest.MockedClass<typeof MercadoPagoClient>;

  beforeEach(() => {
    MockedMercadoPagoClient.mockClear();
    MockedMercadoPagoClient.prototype.getPayment = jest.fn().mockResolvedValue({ id: 'mp-pay-99', status: 'approved', externalReference: 'o-1' });
  });

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
      updateExternalReference: jest.fn().mockResolvedValue(buildPayment()),
      ...overrides.paymentRepository,
    };
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue({ id: 'r-1', name: 'Prime Pizza' }),
      findByMercadoPagoUserId: jest.fn().mockResolvedValue({ id: 'r-1', name: 'Prime Pizza', mercadoPagoAccessToken: 'restaurant-token-1', mercadoPagoUserId: SELLER_USER_ID }),
      ...overrides.restaurantRepository,
    };
    const whatsAppNotificationService: Partial<IWhatsAppNotificationService> = {
      sendPaymentConfirmedMessage: jest.fn().mockResolvedValue(undefined),
      sendOrderStatusUpdate: jest.fn().mockResolvedValue(undefined),
      ...overrides.whatsAppNotificationService,
    };
    const { application, routes } = buildApp();
    new MercadoPagoWebhookController(
      orderRepository as IOrderRepository,
      paymentRepository as IPaymentRepository,
      restaurantRepository as IRestaurantRepository,
      whatsAppNotificationService as IWhatsAppNotificationService,
    ).initializeRoutes(application);
    return { orderRepository, paymentRepository, restaurantRepository, routes };
  }

  it('AC-5: assinatura válida e pagamento approved confirma o pagamento', async () => {
    const { paymentRepository, routes } = setup();
    const json = jest.fn();

    await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json, send: jest.fn() });

    expect(paymentRepository.markAsApproved).toHaveBeenCalledWith('o-1');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ payment: { method: 'creditCardOnline', status: 'aprovado' } }));
  });

  it('assinatura inválida é 401 e não consulta o pagamento', async () => {
    const { routes } = setup();

    await expect(
      routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1', { xSignature: 'ts=1700000000,v1=assinatura-errada' }), { json: jest.fn(), send: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 401 });
    expect(MockedMercadoPagoClient.prototype.getPayment).not.toHaveBeenCalled();
  });

  it('status do pagamento não aprovado (pending) é 200 no-op, sem confirmar nada', async () => {
    MockedMercadoPagoClient.prototype.getPayment = jest.fn().mockResolvedValue({ id: 'mp-pay-99', status: 'pending', externalReference: 'o-1' });
    const { paymentRepository, routes } = setup();
    const send = jest.fn();

    await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json: jest.fn(), send });

    expect(send).toHaveBeenCalledWith(200);
    expect(paymentRepository.markAsApproved).not.toHaveBeenCalled();
  });

  it('tipo de evento diferente de payment é 200 no-op, sem consultar o Mercado Pago', async () => {
    const { routes } = setup();
    const send = jest.fn();

    await routes['POST /webhooks/mercadopago'].at(-1)!({ body: { type: 'subscription', data: { id: 'sub-1' } } }, { json: jest.fn(), send });

    expect(send).toHaveBeenCalledWith(200);
    expect(MockedMercadoPagoClient.prototype.getPayment).not.toHaveBeenCalled();
  });

  it('pedido não encontrado é 404', async () => {
    const { routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(null) } });

    await expect(routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json: jest.fn(), send: jest.fn() })).rejects.toMatchObject({ statusCode: 404 });
  });

  it('pagamento que não é creditCardOnline é 409', async () => {
    const { routes } = setup({ paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ method: 'pix' })) } });

    await expect(routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json: jest.fn(), send: jest.fn() })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('reenvio pro mesmo pagamento já aprovado é 200 idempotente', async () => {
    const { paymentRepository, routes } = setup({ paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ status: 'aprovado' })) } });
    const json = jest.fn();

    await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json, send: jest.fn() });

    expect(paymentRepository.markAsApproved).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ payment: { method: 'creditCardOnline', status: 'aprovado' } }));
  });

  // specs/0226 parte A.
  describe('specs/0226 REQ-A3/REQ-A4 — restaurante pelo user_id e token do restaurante', () => {
    it('consulta o pagamento com o token DO RESTAURANTE achado pelo user_id (não o da plataforma)', async () => {
      const { restaurantRepository, routes } = setup();

      await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json: jest.fn(), send: jest.fn() });

      expect(restaurantRepository.findByMercadoPagoUserId).toHaveBeenCalledWith(SELLER_USER_ID);
      expect(MockedMercadoPagoClient.prototype.getPayment).toHaveBeenCalledWith('restaurant-token-1', 'pay-1');
    });

    it('AC-A3: ao aprovar, grava o id do PAGAMENTO no externalReference (é o que o estorno usa)', async () => {
      const { paymentRepository, routes } = setup();

      await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json: jest.fn(), send: jest.fn() });

      expect(paymentRepository.updateExternalReference).toHaveBeenCalledWith('o-1', 'mp-pay-99');
    });

    it('AC-A4: pagamento de pedido de OUTRO restaurante é 409 e não confirma nada', async () => {
      const { paymentRepository, routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ restaurantId: 'r-outro' })) } });

      await expect(routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json: jest.fn(), send: jest.fn() })).rejects.toMatchObject({ statusCode: 409 });
      expect(paymentRepository.markAsApproved).not.toHaveBeenCalled();
    });

    it('conta sem restaurante vinculado (ex.: simulação do painel) é 200 ignorado, sem consultar o Mercado Pago', async () => {
      const { paymentRepository, routes } = setup({ restaurantRepository: { findByMercadoPagoUserId: jest.fn().mockResolvedValue(null) } });
      const send = jest.fn();
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1', { userId: '999' }), { json: jest.fn(), send });

      expect(send).toHaveBeenCalledWith(200);
      expect(MockedMercadoPagoClient.prototype.getPayment).not.toHaveBeenCalled();
      expect(paymentRepository.markAsApproved).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('aviso sem user_id é 400', async () => {
      const { routes } = setup();

      await expect(routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1', { userId: null }), { json: jest.fn(), send: jest.fn() })).rejects.toMatchObject({ statusCode: 400 });
      expect(MockedMercadoPagoClient.prototype.getPayment).not.toHaveBeenCalled();
    });

    it('REQ-A5: pagamento cobrado pelo Asaas é 409 (não confirma pelo Mercado Pago)', async () => {
      const { paymentRepository, routes } = setup({ paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ provider: 'asaas' })) } });

      await expect(routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json: jest.fn(), send: jest.fn() })).rejects.toMatchObject({ statusCode: 409 });
      expect(paymentRepository.markAsApproved).not.toHaveBeenCalled();
    });
  });
});
