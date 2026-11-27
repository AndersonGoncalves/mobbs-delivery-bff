import { createHmac } from 'crypto';
import type { Request, Response, Server } from 'restify';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IPaymentRepository } from '../../orders/domain/repositories/payment.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IWhatsAppNotificationService } from '../../notifications/domain/services/i-whatsapp-notification.service';
import { MercadoPagoApiError, MercadoPagoClient } from '../infra/mercado-pago-client';
import { MercadoPagoWebhookController } from './mercado-pago-webhook.controller';

// Cliente falso (automock), mas o erro de verdade: o webhook decide pelo `status` dele (REQ-A18).
jest.mock('../infra/mercado-pago-client', () => ({
  ...jest.createMockFromModule<object>('../infra/mercado-pago-client'),
  MercadoPagoApiError: jest.requireActual('../infra/mercado-pago-client').MercadoPagoApiError,
}));
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

function buildReq(paymentId: string, overrides: { xSignature?: string; xRequestId?: string; userId?: string | null; type?: string } = {}): FakeRequest {
  const ts = '1700000000';
  const xRequestId = overrides.xRequestId ?? 'req-1';
  // Manifesto com o id em minúsculas (regra do Mercado Pago pra id alfanumérico, ex. `ORD…`).
  const xSignature = overrides.xSignature ?? signature(paymentId.toLowerCase(), xRequestId, ts);
  return {
    body: { type: overrides.type ?? 'payment', data: { id: paymentId }, ...(overrides.userId === null ? {} : { user_id: overrides.userId ?? SELLER_USER_ID }) },
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
      markAsApprovedIfPending: jest.fn().mockResolvedValue(buildPayment({ status: 'aprovado' })),
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

  it('specs/0226 AC-A18: pedido não encontrado é 200 ignorado (antes 404), sem confirmar nada', async () => {
    const { paymentRepository, routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(null) } });

    const send = jest.fn();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json: jest.fn(), send });
    expect(send).toHaveBeenCalledWith(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignorado'));
    warn.mockRestore();
    expect(paymentRepository.markAsApprovedIfPending).not.toHaveBeenCalled();
  });

  it('specs/0226 AC-A18: pagamento que não é creditCardOnline é 200 ignorado (antes 409)', async () => {
    const { paymentRepository, routes } = setup({ paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ method: 'pix' })) } });

    const send = jest.fn();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json: jest.fn(), send });
    expect(send).toHaveBeenCalledWith(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignorado'));
    warn.mockRestore();
    expect(paymentRepository.markAsApprovedIfPending).not.toHaveBeenCalled();
  });

  it('specs/0226 AC-A18: pagamento que o Mercado Pago diz não existir (404, ex. "Simular notificação") é 200 ignorado (antes 500)', async () => {
    MockedMercadoPagoClient.prototype.getPayment = jest
      .fn()
      .mockRejectedValue(new MercadoPagoApiError('Mercado Pago API (GET /v1/payments/123456) respondeu 404: {"message":"Payment not found"}', 404));
    const { paymentRepository, orderRepository, routes } = setup();
    const send = jest.fn();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('123456'), { json: jest.fn(), send });

    expect(send).toHaveBeenCalledWith(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('não encontrado no Mercado Pago'));
    expect(orderRepository.findById).not.toHaveBeenCalled();
    expect(paymentRepository.markAsApprovedIfPending).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('specs/0226 AC-A18: order (Pix) que o Mercado Pago diz não existir (404) é 200 ignorado', async () => {
    MockedMercadoPagoClient.prototype.getOrder = jest.fn().mockRejectedValue(new MercadoPagoApiError('Mercado Pago API (GET /v1/orders/ORD01X) respondeu 404', 404));
    const { routes } = setup();
    const send = jest.fn();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('ORD01X', { type: 'order' }), { json: jest.fn(), send });

    expect(send).toHaveBeenCalledWith(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('order não encontrado no Mercado Pago'));
    warn.mockRestore();
  });

  it('specs/0226 AC-A18: Mercado Pago com falha na consulta (500) continua erro, para ele reenviar e o Sentry avisar', async () => {
    MockedMercadoPagoClient.prototype.getPayment = jest.fn().mockRejectedValue(new MercadoPagoApiError('Mercado Pago API (GET /v1/payments/pay-1) respondeu 500', 500));
    const { routes } = setup();
    const send = jest.fn();

    await expect(routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json: jest.fn(), send })).rejects.toThrow('respondeu 500');
    expect(send).not.toHaveBeenCalled();
  });

  it('specs/0226 AC-A18: pagamento que não está mais pendente (ex. estornado) é 200 ignorado (antes 409)', async () => {
    const { paymentRepository, routes } = setup({ paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ status: 'estornado' })) } });

    const send = jest.fn();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json: jest.fn(), send });
    expect(send).toHaveBeenCalledWith(200);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignorado'));
    warn.mockRestore();
    expect(paymentRepository.markAsApprovedIfPending).not.toHaveBeenCalled();
  });

  it('reenvio pro mesmo pagamento já aprovado é 200 idempotente', async () => {
    const { paymentRepository, routes } = setup({ paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ status: 'aprovado' })) } });
    const json = jest.fn();

    await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json, send: jest.fn() });

    expect(paymentRepository.markAsApproved).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ payment: { method: 'creditCardOnline', status: 'aprovado' } }));
  });

  // ---- specs/0226 REQ-A19 — cartão recusado (achado na homologação, pedido #10) ----
  it('AC-A19: cartão recusado (rejected) marca o pagamento como recusado, sem confirmar o pedido', async () => {
    MockedMercadoPagoClient.prototype.getPayment = jest.fn().mockResolvedValue({ id: 'mp-pay-99', status: 'rejected', externalReference: 'o-1' });
    const markAsRefusedIfPending = jest.fn().mockResolvedValue(buildPayment({ status: 'recusado' }));
    const { paymentRepository, orderRepository, routes } = setup({ paymentRepository: { markAsRefusedIfPending } });
    const send = jest.fn();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json: jest.fn(), send });
    warn.mockRestore();

    expect(send).toHaveBeenCalledWith(200);
    expect(markAsRefusedIfPending).toHaveBeenCalledWith('o-1');
    expect(paymentRepository.markAsApprovedIfPending).not.toHaveBeenCalled();
    expect(orderRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('AC-A19: pagamento pendente (pending) não marca recusado', async () => {
    MockedMercadoPagoClient.prototype.getPayment = jest.fn().mockResolvedValue({ id: 'mp-pay-99', status: 'pending', externalReference: 'o-1' });
    const markAsRefusedIfPending = jest.fn();
    const { routes } = setup({ paymentRepository: { markAsRefusedIfPending } });

    await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json: jest.fn(), send: jest.fn() });

    expect(markAsRefusedIfPending).not.toHaveBeenCalled();
  });

  it('AC-A19: depois de recusado, nova tentativa aprovada no mesmo checkout confirma o pedido', async () => {
    const { paymentRepository, routes } = setup({ paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ status: 'recusado' })) } });
    const json = jest.fn();

    await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json, send: jest.fn() });

    expect(paymentRepository.markAsApprovedIfPending).toHaveBeenCalledWith('o-1');
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

    it('AC-A4/AC-A18: pagamento de pedido de OUTRO restaurante é 200 ignorado (antes 409) e não confirma nada', async () => {
      const { paymentRepository, routes } = setup({ orderRepository: { findById: jest.fn().mockResolvedValue(buildOrder({ restaurantId: 'r-outro' })) } });

      const send = jest.fn();
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json: jest.fn(), send });
      expect(send).toHaveBeenCalledWith(200);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignorado'));
      warn.mockRestore();
      expect(paymentRepository.markAsApproved).not.toHaveBeenCalled();
      expect(paymentRepository.markAsApprovedIfPending).not.toHaveBeenCalled();
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

    it('AC-A18: aviso sem user_id é 200 ignorado (antes 400), sem consultar o Mercado Pago', async () => {
      const { routes } = setup();

      const send = jest.fn();
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1', { userId: null }), { json: jest.fn(), send });
      expect(send).toHaveBeenCalledWith(200);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignorado'));
      warn.mockRestore();
      expect(MockedMercadoPagoClient.prototype.getPayment).not.toHaveBeenCalled();
    });

    it('REQ-A5/AC-A18: pagamento cobrado pelo Asaas é 200 ignorado (antes 409) e não confirma pelo Mercado Pago', async () => {
      const { paymentRepository, routes } = setup({ paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ provider: 'asaas' })) } });

      const send = jest.fn();
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('pay-1'), { json: jest.fn(), send });
      expect(send).toHaveBeenCalledWith(200);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignorado'));
      warn.mockRestore();
      expect(paymentRepository.markAsApproved).not.toHaveBeenCalled();
      expect(paymentRepository.markAsApprovedIfPending).not.toHaveBeenCalled();
    });
  });

  describe('specs/0226 REQ-B3 — Pix pelo Mercado Pago', () => {
    const pixOrder = () => buildOrder({ paymentMethod: 'pix' });
    const pixPayment = (overrides: Record<string, unknown> = {}) =>
      buildPayment({ method: 'pix', provider: 'mercadopago', externalReference: 'ORD01ABC', pixPayload: '000201...', ...overrides });

    it('AC-B1: tópico order processed confirma o Pix, consultando a order com o token do restaurante', async () => {
      MockedMercadoPagoClient.prototype.getOrder = jest.fn().mockResolvedValue({ id: 'ORD01ABC', status: 'processed', statusDetail: 'accredited', externalReference: 'o-1' });
      const { paymentRepository, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(pixOrder()) },
        paymentRepository: {
          findByOrderId: jest.fn().mockResolvedValue(pixPayment()),
          markAsApprovedIfPending: jest.fn().mockResolvedValue(pixPayment({ status: 'aprovado' })),
          markAsApproved: jest.fn().mockResolvedValue(pixPayment({ status: 'aprovado' })),
        },
      });
      const json = jest.fn();

      await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('ORD01ABC', { type: 'order' }), { json, send: jest.fn() });

      expect(MockedMercadoPagoClient.prototype.getOrder).toHaveBeenCalledWith('restaurant-token-1', 'ORD01ABC');
      expect(paymentRepository.markAsApprovedIfPending).toHaveBeenCalledWith('o-1');
      // O Pix mantém o id da ORDER (é o que o estorno do Pix usa) — não troca pelo id do pagamento.
      expect(paymentRepository.updateExternalReference).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ payment: { method: 'pix', status: 'aprovado' } }));
    });

    it('tópico order ainda aguardando o Pix (action_required) é 200 no-op', async () => {
      MockedMercadoPagoClient.prototype.getOrder = jest.fn().mockResolvedValue({ id: 'ORD01ABC', status: 'action_required', externalReference: 'o-1' });
      const { paymentRepository, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(pixOrder()) },
        paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(pixPayment()) },
      });
      const send = jest.fn();

      await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('ORD01ABC', { type: 'order' }), { json: jest.fn(), send });

      expect(send).toHaveBeenCalledWith(200);
      expect(paymentRepository.markAsApprovedIfPending).not.toHaveBeenCalled();
    });

    it('tópico payment de um Pix aprovado também confirma (o Mercado Pago avisa pelos dois)', async () => {
      MockedMercadoPagoClient.prototype.getPayment = jest.fn().mockResolvedValue({ id: '190401708935', status: 'approved', externalReference: 'o-1', paymentMethodId: 'pix' });
      const { paymentRepository, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(pixOrder()) },
        paymentRepository: {
          findByOrderId: jest.fn().mockResolvedValue(pixPayment()),
          markAsApprovedIfPending: jest.fn().mockResolvedValue(pixPayment({ status: 'aprovado' })),
          markAsApproved: jest.fn().mockResolvedValue(pixPayment({ status: 'aprovado' })),
        },
      });

      await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('190401708935'), { json: jest.fn(), send: jest.fn() });

      expect(paymentRepository.markAsApprovedIfPending).toHaveBeenCalledWith('o-1');
      expect(paymentRepository.updateExternalReference).not.toHaveBeenCalled();
    });

    it('AC-B2: dois avisos ao mesmo tempo — o segundo perde a trava atômica e não confirma de novo', async () => {
      MockedMercadoPagoClient.prototype.getOrder = jest.fn().mockResolvedValue({ id: 'ORD01ABC', status: 'processed', externalReference: 'o-1' });
      const sendPaymentConfirmedMessage = jest.fn().mockResolvedValue(undefined);
      const { paymentRepository, orderRepository, routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(pixOrder()) },
        paymentRepository: {
          // Leu "pendente" antes do outro aviso aprovar, mas a trava já foi tomada.
          findByOrderId: jest.fn().mockResolvedValue(pixPayment()),
          markAsApprovedIfPending: jest.fn().mockResolvedValue(null),
        },
        whatsAppNotificationService: { sendPaymentConfirmedMessage },
      });
      const json = jest.fn();

      await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('ORD01ABC', { type: 'order' }), { json, send: jest.fn() });

      expect(paymentRepository.markAsApproved).not.toHaveBeenCalled();
      expect(orderRepository.updateStatus).not.toHaveBeenCalled();
      expect(sendPaymentConfirmedMessage).not.toHaveBeenCalled();
      expect(json).toHaveBeenCalledWith(200, expect.anything());
    });

    it('AC-A18: tópico order para um pedido cujo pagamento não é Pix do Mercado Pago (ex. chave manual) é 200 ignorado (antes 409)', async () => {
      MockedMercadoPagoClient.prototype.getOrder = jest.fn().mockResolvedValue({ id: 'ORD01ABC', status: 'processed', externalReference: 'o-1' });
      const { routes } = setup({
        orderRepository: { findById: jest.fn().mockResolvedValue(pixOrder()) },
        paymentRepository: { findByOrderId: jest.fn().mockResolvedValue(buildPayment({ method: 'pix' })) },
      });

      const send = jest.fn();
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('ORD01ABC', { type: 'order' }), { json: jest.fn(), send });
      expect(send).toHaveBeenCalledWith(200);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignorado'));
      warn.mockRestore();
    });

    it('AC-A18: aviso de Pix (tópico payment) num pedido de cartão é 200 ignorado (antes 409) — Pix nunca confirma cartão', async () => {
      MockedMercadoPagoClient.prototype.getPayment = jest.fn().mockResolvedValue({ id: '1', status: 'approved', externalReference: 'o-1', paymentMethodId: 'pix' });
      const { routes } = setup();

      const send = jest.fn();
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      await routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('1'), { json: jest.fn(), send });
      expect(send).toHaveBeenCalledWith(200);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignorado'));
      warn.mockRestore();
    });

    it('assinatura do tópico order: id alfanumérico em minúsculas no manifesto (maiúsculas = 401)', async () => {
      const { routes } = setup();
      const upperSignature = signature('ORD01ABC', 'req-1', '1700000000');

      await expect(
        routes['POST /webhooks/mercadopago'].at(-1)!(buildReq('ORD01ABC', { type: 'order', xSignature: upperSignature }), { json: jest.fn(), send: jest.fn() }),
      ).rejects.toMatchObject({ statusCode: 401 });
    });
  });
});
