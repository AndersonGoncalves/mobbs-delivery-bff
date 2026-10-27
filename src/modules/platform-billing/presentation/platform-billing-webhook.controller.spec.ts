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

function setup(overrides: { obligation?: ISubscriptionObligation | null; wasAlreadyRecorded?: boolean } = {}) {
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

  it('PAYMENT_REFUNDED marca a obligation como refunded', async () => {
    const { routes, obligationRepository } = setup();

    await routes['POST /webhooks/platform-billing'][0](
      buildReq('webhook-token-1', { event: 'PAYMENT_REFUNDED', payment: { externalReference: 'ob-1' } }),
      { json: jest.fn(), send: jest.fn() },
    );

    expect(obligationRepository.markRefunded).toHaveBeenCalledWith('ob-1');
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
