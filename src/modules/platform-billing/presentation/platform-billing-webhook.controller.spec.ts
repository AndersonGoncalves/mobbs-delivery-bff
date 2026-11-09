import type { Request, Response, Server } from 'restify';
import { localMidnight } from '../domain/billing-calendar';
import type { ISubscriptionObligation } from '../domain/entities/subscription-obligation.entity';
import { PlatformBillingWebhookController } from './platform-billing-webhook.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { header?: (name: string) => string | undefined };
type FakeResponse = Pick<Response, 'json' | 'send'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildApp() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = { post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; } };
  return { application: application as unknown as Server, routes };
}

function buildReq(token: string | undefined, body: unknown): FakeRequest {
  return { body, header: (name: string) => (name === 'asaas-access-token' ? token : undefined) };
}

function buildObligation(overrides: Partial<ISubscriptionObligation> = {}): ISubscriptionObligation {
  return {
    id: 'ob-1', restaurantId: 'r-1', kind: 'monthly', referenceMonth: '2026-10', tier: 'pro', settingsVersionId: 'v1',
    amountCents: 7990, status: 'pending', asaasChargeId: 'pay_1', dueDate: localMidnight(new Date('2026-11-10T12:00:00Z')),
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

function setup(overrides: { obligation?: ISubscriptionObligation | null; wasAlreadyRecorded?: boolean; observers?: unknown[] } = {}) {
  const stored = { current: overrides.obligation === undefined ? buildObligation() : overrides.obligation };
  const obligationRepository = {
    findById: jest.fn().mockImplementation(async () => stored.current),
    markPaid: jest.fn().mockImplementation(async (_id, paidAt) => { stored.current = { ...stored.current!, status: 'paid', paidAt }; return stored.current; }),
    markRefunded: jest.fn().mockImplementation(async () => { stored.current = { ...stored.current!, status: 'refunded' }; return stored.current; }),
    markOverdue: jest.fn().mockImplementation(async () => { stored.current = { ...stored.current!, status: 'overdue' }; return stored.current; }),
  };
  const subscriptionEventRepository = {
    append: jest.fn().mockResolvedValue({ event: { id: 'ev-1' }, wasAlreadyRecorded: overrides.wasAlreadyRecorded ?? false }),
  };
  const platformBillingCycleService = { recomputeAndPersist: jest.fn().mockResolvedValue(undefined) };
  const { application, routes } = buildApp();
  new PlatformBillingWebhookController({
    obligationRepository, subscriptionEventRepository, platformBillingCycleService, webhookToken: 'webhook-token-1',
    observers: overrides.observers ?? [],
  } as never).initializeRoutes(application);
  return { routes, obligationRepository, subscriptionEventRepository, platformBillingCycleService };
}

describe('PlatformBillingWebhookController (specs/0175-cobranca-assinatura-asaas)', () => {
  it('PAYMENT_CONFIRMED com token válido marca a obligation como paga e recalcula o acesso', async () => {
    const { routes, obligationRepository, platformBillingCycleService } = setup();
    const json = jest.fn();

    await routes['POST /webhooks/platform-billing'][0](
      buildReq('webhook-token-1', { event: 'PAYMENT_CONFIRMED', payment: { id: 'pay_1', externalReference: 'ob-1' } }),
      { json, send: jest.fn() },
    );

    expect(obligationRepository.markPaid).toHaveBeenCalledWith('ob-1', expect.any(Date));
    expect(platformBillingCycleService.recomputeAndPersist).toHaveBeenCalledWith('r-1', expect.any(Date));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ obligationId: 'ob-1', status: 'paid' }));
  });

  it('AC-15: token inválido é 401', async () => {
    const { routes } = setup();

    await expect(
      routes['POST /webhooks/platform-billing'][0](
        buildReq('token-errado', { event: 'PAYMENT_CONFIRMED', payment: { externalReference: 'ob-1' } }),
        { json: jest.fn(), send: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('AC-15: referência (obligationId) desconhecida é 200 no-op, nunca libera nada', async () => {
    const { routes, obligationRepository } = setup({ obligation: null });
    const send = jest.fn();

    await routes['POST /webhooks/platform-billing'][0](
      buildReq('webhook-token-1', { event: 'PAYMENT_CONFIRMED', payment: { externalReference: 'ob-desconhecida' } }),
      { json: jest.fn(), send },
    );

    expect(send).toHaveBeenCalledWith(200);
    expect(obligationRepository.markPaid).not.toHaveBeenCalled();
  });

  it('AC-15: evento duplicado (mesmo asaasEventId) não reaplica a baixa', async () => {
    const paidObligation = buildObligation({ status: 'paid' });
    const { routes, obligationRepository } = setup({ obligation: paidObligation, wasAlreadyRecorded: true });
    const json = jest.fn();

    await routes['POST /webhooks/platform-billing'][0](
      buildReq('webhook-token-1', { id: 'evt_1', event: 'PAYMENT_CONFIRMED', payment: { externalReference: 'ob-1' } }),
      { json, send: jest.fn() },
    );

    expect(obligationRepository.markPaid).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, { obligationId: 'ob-1', status: 'paid' });
  });

  it('evento sem relação com pagamento confirmado/estornado/vencido não muda o status', async () => {
    const { routes, obligationRepository } = setup();
    const json = jest.fn();

    await routes['POST /webhooks/platform-billing'][0](
      buildReq('webhook-token-1', { event: 'PAYMENT_CREATED', payment: { externalReference: 'ob-1' } }),
      { json, send: jest.fn() },
    );

    expect(obligationRepository.markPaid).not.toHaveBeenCalled();
    expect(obligationRepository.markOverdue).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'pending' }));
  });

  // Achado de auditoria (06/11/2026) — o Asaas não garante ordem de entrega de webhook: um
  // PAYMENT_OVERDUE chegando depois de um PAYMENT_CONFIRMED/RECEIVED já processado não pode
  // rebaixar quem já pagou.
  it('PAYMENT_OVERDUE chegando depois de uma obligation já paga não rebaixa o status', async () => {
    const paidObligation = buildObligation({ status: 'paid' });
    const { routes, obligationRepository, platformBillingCycleService } = setup({ obligation: paidObligation });
    const json = jest.fn();

    await routes['POST /webhooks/platform-billing'][0](
      buildReq('webhook-token-1', { event: 'PAYMENT_OVERDUE', payment: { externalReference: 'ob-1' } }),
      { json, send: jest.fn() },
    );

    expect(obligationRepository.markOverdue).not.toHaveBeenCalled();
    expect(platformBillingCycleService.recomputeAndPersist).toHaveBeenCalledWith('r-1', expect.any(Date));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ obligationId: 'ob-1', status: 'paid' }));
  });

  it('PAYMENT_OVERDUE numa obligation pendente marca como overdue normalmente', async () => {
    const { routes, obligationRepository } = setup();

    await routes['POST /webhooks/platform-billing'][0](
      buildReq('webhook-token-1', { event: 'PAYMENT_OVERDUE', payment: { externalReference: 'ob-1' } }),
      { json: jest.fn(), send: jest.fn() },
    );

    expect(obligationRepository.markOverdue).toHaveBeenCalledWith('ob-1');
  });

  it('PAYMENT_REFUNDED marca a obligation como refunded', async () => {
    const { routes, obligationRepository } = setup();

    await routes['POST /webhooks/platform-billing'][0](
      buildReq('webhook-token-1', { event: 'PAYMENT_REFUNDED', payment: { externalReference: 'ob-1' } }),
      { json: jest.fn(), send: jest.fn() },
    );

    expect(obligationRepository.markRefunded).toHaveBeenCalledWith('ob-1');
  });

  // Achado de auditoria (06/11/2026) — reenvio do evento (asaasEventId diferente, passa pela
  // dedup) numa obligation já estornada não pode reprocessar o estorno nem renotificar observers.
  it('PAYMENT_REFUNDED reenviado numa obligation já estornada não reprocessa nem renotifica observers', async () => {
    const refundedObligation = buildObligation({ status: 'refunded' });
    const observer = { onObligationPaid: jest.fn(), onObligationRefunded: jest.fn() };
    const { routes, obligationRepository } = setup({ obligation: refundedObligation, observers: [observer] });
    const json = jest.fn();

    await routes['POST /webhooks/platform-billing'][0](
      buildReq('webhook-token-1', { id: 'evt_2', event: 'PAYMENT_REFUNDED', payment: { externalReference: 'ob-1' } }),
      { json, send: jest.fn() },
    );

    expect(obligationRepository.markRefunded).not.toHaveBeenCalled();
    expect(observer.onObligationRefunded).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ obligationId: 'ob-1', status: 'refunded' }));
  });

  // specs/0205-comissao-revendedor plan.md — observers (hoje, `resellers`) notificados depois de
  // markPaid/markRefunded, sem que este módulo precise conhecer quem os implementa.
  it('specs/0205: PAYMENT_CONFIRMED notifica os observers com a obligation paga', async () => {
    const observer = { onObligationPaid: jest.fn().mockResolvedValue(undefined), onObligationRefunded: jest.fn() };
    const { routes } = setup({ observers: [observer] });

    await routes['POST /webhooks/platform-billing'][0](
      buildReq('webhook-token-1', { event: 'PAYMENT_CONFIRMED', payment: { externalReference: 'ob-1' } }),
      { json: jest.fn(), send: jest.fn() },
    );

    expect(observer.onObligationPaid).toHaveBeenCalledWith(expect.objectContaining({ id: 'ob-1' }));
    expect(observer.onObligationRefunded).not.toHaveBeenCalled();
  });

  it('specs/0205: PAYMENT_REFUNDED notifica os observers com a obligation estornada', async () => {
    const observer = { onObligationPaid: jest.fn(), onObligationRefunded: jest.fn().mockResolvedValue(undefined) };
    const { routes } = setup({ observers: [observer] });

    await routes['POST /webhooks/platform-billing'][0](
      buildReq('webhook-token-1', { event: 'PAYMENT_REFUNDED', payment: { externalReference: 'ob-1' } }),
      { json: jest.fn(), send: jest.fn() },
    );

    expect(observer.onObligationRefunded).toHaveBeenCalledWith(expect.objectContaining({ id: 'ob-1' }));
    expect(observer.onObligationPaid).not.toHaveBeenCalled();
  });

  it('sem externalReference no payload é 200 no-op', async () => {
    const { routes, obligationRepository } = setup();
    const send = jest.fn();

    await routes['POST /webhooks/platform-billing'][0](
      buildReq('webhook-token-1', { event: 'PAYMENT_CONFIRMED', payment: {} }),
      { json: jest.fn(), send },
    );

    expect(send).toHaveBeenCalledWith(200);
    expect(obligationRepository.markPaid).not.toHaveBeenCalled();
  });
});
