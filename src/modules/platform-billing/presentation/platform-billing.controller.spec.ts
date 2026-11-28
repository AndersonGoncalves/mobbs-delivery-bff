import type { Request, Response, Server } from 'restify';
import { DEFAULT_BILLING_SETTINGS } from '../../billing/domain/billing';
import { localMidnight } from '../domain/billing-calendar';
import type { ISubscriptionObligation } from '../domain/entities/subscription-obligation.entity';
import { AnnualAdhesionAlreadyActiveError, AnnualRenewalNotReactivatableError, AnnualSubscriptionService } from '../domain/services/annual-subscription.service';
import { BillingPayerService } from '../domain/services/billing-payer.service';
import { ReconciliationService } from '../domain/services/reconciliation.service';
import { PlatformBillingController } from './platform-billing.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body'>> & { user?: { uid: string; email?: string }; restaurantId?: string; operatorRole?: string; operatorId?: string; hasFullAccess?: boolean };
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => { routes[`GET ${path}`] = handlers; },
    post: (path: string, ...handlers: RouteHandler[]) => { routes[`POST ${path}`] = handlers; },
  };
  return { application: application as unknown as Server, routes };
}

// Pula `firebaseAuthMiddleware` + `restaurantOperatorMiddlewareWithoutBillingGuard` (specs
// próprias) e injeta `req.restaurantId`/`req.operatorRole` manualmente — mesmo padrão de
// `runOperatorChain` em `orders.controller.spec.ts`, mas rodando o guard de papel real (3º
// handler) pra testar a própria autorização.
async function runChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(2)) {
    await handler(req, res);
  }
}

function buildObligation(overrides: Partial<ISubscriptionObligation> = {}): ISubscriptionObligation {
  return {
    id: 'ob-1', restaurantId: 'r-1', kind: 'annual-initial', tier: 'pro', settingsVersionId: 'v1', amountCents: 79900,
    status: 'pending', asaasChargeId: 'pay_1', dueDate: localMidnight(new Date('2026-11-03T12:00:00Z')),
    coveragePeriod: { start: localMidnight(new Date('2026-10-24T12:00:00Z')), end: localMidnight(new Date('2027-10-24T12:00:00Z')) },
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

function setup(overrides: { obligations?: ISubscriptionObligation[] } = {}) {
  const billingSettingsRepository = { get: jest.fn().mockResolvedValue(DEFAULT_BILLING_SETTINGS), update: jest.fn() };
  const billingPayerRepository = { findByRestaurantId: jest.fn().mockResolvedValue({ id: 'payer-1', restaurantId: 'r-1', completedAt: new Date() }), save: jest.fn() };
  const obligationRepository = {
    findById: jest.fn().mockImplementation(async (id: string) => (overrides.obligations ?? [buildObligation()]).find((o) => o.id === id) ?? null),
    findByRestaurantId: jest.fn().mockResolvedValue(overrides.obligations ?? [buildObligation()]),
    findOpenByRestaurantId: jest.fn().mockResolvedValue([]),
    markPaid: jest.fn(),
  };
  const annualSubscriptionRepository = {
    findActiveByRestaurantId: jest.fn().mockResolvedValue({ id: 'sub-1', restaurantId: 'r-1', renewalActive: true, joinedAt: new Date(), createdAt: new Date(), updatedAt: new Date() }),
  };
  const pixAvailabilityExceptionRepository = { findByObligationId: jest.fn().mockResolvedValue(null) };
  const orderRepository = { findDeliveredByRestaurantBetween: jest.fn().mockResolvedValue([]) };

  const billingPayerService = new BillingPayerService({ billingPayerRepository, asaasClient: { createCustomer: jest.fn() } } as never);
  jest.spyOn(billingPayerService, 'completePayer').mockResolvedValue({ id: 'payer-1' } as never);

  const annualSubscriptionService = new AnnualSubscriptionService({} as never);
  jest.spyOn(annualSubscriptionService, 'subscribe').mockResolvedValue({ subscription: { id: 'sub-1' } as never, obligation: buildObligation() });
  jest.spyOn(annualSubscriptionService, 'cancelRenewal').mockResolvedValue({ id: 'sub-1', renewalActive: false } as never);
  jest.spyOn(annualSubscriptionService, 'withdrawUnpaidAnnual').mockResolvedValue(undefined);
  jest.spyOn(annualSubscriptionService, 'findCurrent').mockResolvedValue(null);
  jest.spyOn(annualSubscriptionService, 'reactivateRenewal').mockResolvedValue({ subscription: { id: 'sub-1', renewalActive: true } as never, coverageEnd: new Date('2027-11-27T03:00:00Z') });

  const reconciliationService = new ReconciliationService({} as never);
  jest.spyOn(reconciliationService, 'reconcile').mockResolvedValue(undefined);

  const obligationIssuanceService = { issuePending: jest.fn().mockResolvedValue(undefined) };
  const restaurantOperatorMiddlewareWithoutBillingGuard = jest.fn();
  const { application, routes } = buildFakeApplication();
  new PlatformBillingController({
    restaurantOperatorMiddlewareWithoutBillingGuard, billingSettingsRepository, billingPayerRepository, obligationRepository,
    annualSubscriptionRepository, pixAvailabilityExceptionRepository, billingPayerService, annualSubscriptionService, reconciliationService, orderRepository,
    obligationIssuanceService,
  } as never).initializeRoutes(application);

  return { routes, obligationRepository, annualSubscriptionRepository, annualSubscriptionService, reconciliationService, billingPayerService, billingPayerRepository, obligationIssuanceService };
}

describe('PlatformBillingController (specs/0175-cobranca-assinatura-asaas)', () => {
  it('REQ-33: Garçom/Motoboy não acessam /billing/plans (403)', async () => {
    const { routes } = setup();

    await expect(
      runChain(routes['GET /restaurants/me/billing/plans'], { restaurantId: 'r-1', operatorRole: 'garcom' as never }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('REQ-33: Caixa/financeiro consulta /billing/plans normalmente', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runChain(routes['GET /restaurants/me/billing/plans'], { restaurantId: 'r-1', operatorRole: 'financeiro' as never }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ settings: DEFAULT_BILLING_SETTINGS }));
  });

  it('REQ-33: só o Dono completa o pagador — Gerente é 403', async () => {
    const { routes } = setup();

    await expect(
      runChain(
        routes['POST /restaurants/me/billing/payer'],
        { restaurantId: 'r-1', operatorRole: 'gerente' as never, body: {} },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('Dono completa o pagador com sucesso', async () => {
    const { routes, billingPayerService } = setup();
    const json = jest.fn();
    const body = { legalName: 'Prime Pizza', document: '12345678000190', email: 'dono@primepizza.com', phone: '11999999999', address: { street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'SP', state: 'SP', zipCode: '01000000' } };

    await runChain(routes['POST /restaurants/me/billing/payer'], { restaurantId: 'r-1', operatorRole: 'dono' as never, body }, { json });

    expect(billingPayerService.completePayer).toHaveBeenCalledWith('r-1', body, expect.any(Date));
    expect(json).toHaveBeenCalledWith(200, { id: 'payer-1' });
  });

  it('REQ-30: GET invoices/:id/pix nunca devolve fatura de outro restaurante (404)', async () => {
    const { routes } = setup({ obligations: [buildObligation({ restaurantId: 'r-OUTRO' })] });

    await expect(
      runChain(routes['GET /restaurants/me/billing/invoices/:id/pix'], { restaurantId: 'r-1', operatorRole: 'dono' as never, params: { id: 'ob-1' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('GET invoices/:id/pix devolve o payload da fatura própria', async () => {
    const { routes } = setup({ obligations: [buildObligation({ pixPayload: '00020126...' })] });
    const json = jest.fn();

    await runChain(routes['GET /restaurants/me/billing/invoices/:id/pix'], { restaurantId: 'r-1', operatorRole: 'dono' as never, params: { id: 'ob-1' } }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ pixPayload: '00020126...' }));
  });

  it('specs/0175 AC-17b: fatura estornada não expõe o Pix antigo (cobrança encerrada no Asaas)', async () => {
    const { routes } = setup({ obligations: [buildObligation({ status: 'refunded', pixPayload: '00020126...antigo' })] });
    const pixJson = jest.fn();
    const listJson = jest.fn();

    await runChain(routes['GET /restaurants/me/billing/invoices/:id/pix'], { restaurantId: 'r-1', operatorRole: 'dono' as never, params: { id: 'ob-1' } }, { json: pixJson });
    await runChain(routes['GET /restaurants/me/billing/invoices'], { restaurantId: 'r-1', operatorRole: 'dono' as never }, { json: listJson });

    expect(pixJson).toHaveBeenCalledWith(200, expect.objectContaining({ pixPayload: undefined, status: 'refunded' }));
    expect(listJson.mock.calls[0][1][0]).toEqual(expect.objectContaining({ status: 'refunded', pixPayload: undefined }));
  });

  it('REQ-22: POST invoices/:id/verify reconcilia e devolve o estado atualizado', async () => {
    const { routes, reconciliationService } = setup();
    const json = jest.fn();

    await runChain(routes['POST /restaurants/me/billing/invoices/:id/verify'], { restaurantId: 'r-1', operatorRole: 'dono' as never, params: { id: 'ob-1' } }, { json });

    expect(reconciliationService.reconcile).toHaveBeenCalledWith(expect.any(Date), { obligationId: 'ob-1' });
    expect(json).toHaveBeenCalled();
  });

  it('REQ-13: POST annual/subscribe (Dono) cria a adesão', async () => {
    const { routes, annualSubscriptionService } = setup();
    const json = jest.fn();

    await runChain(routes['POST /restaurants/me/billing/annual/subscribe'], { restaurantId: 'r-1', operatorRole: 'dono' as never, user: { uid: 'u-1' } }, { json });

    expect(annualSubscriptionService.subscribe).toHaveBeenCalledWith('r-1', expect.any(Date));
    expect(json).toHaveBeenCalledWith(201, expect.anything());
  });

  it('specs/0175 T056: contratar o anual já dispara a emissão do Pix daquela loja (sem esperar o ciclo)', async () => {
    const { routes, obligationIssuanceService } = setup();
    const json = jest.fn();

    await runChain(routes['POST /restaurants/me/billing/annual/subscribe'], { restaurantId: 'r-1', operatorRole: 'dono' as never, user: { uid: 'u-1' } }, { json });

    expect(json).toHaveBeenCalledWith(201, expect.anything());
    expect(obligationIssuanceService.issuePending).toHaveBeenCalledWith(expect.any(Date), 'r-1');
  });

  it('specs/0175 T056: falha na emissão imediata não derruba a contratação (fica pro ciclo)', async () => {
    const { routes, obligationIssuanceService } = setup();
    obligationIssuanceService.issuePending.mockRejectedValue(new Error('Asaas fora'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const json = jest.fn();

    await runChain(routes['POST /restaurants/me/billing/annual/subscribe'], { restaurantId: 'r-1', operatorRole: 'dono' as never, user: { uid: 'u-1' } }, { json });
    await new Promise((resolve) => setImmediate(resolve));

    expect(json).toHaveBeenCalledWith(201, expect.anything());
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('emissão imediata'), expect.any(Error));
    errorSpy.mockRestore();
  });

  it('specs/0175 T050: contratar o anual sem pagador completo é recusado (409) e nada é criado', async () => {
    const { routes, annualSubscriptionService, billingPayerRepository, obligationIssuanceService } = setup();
    billingPayerRepository.findByRestaurantId.mockResolvedValue(null);

    await expect(
      runChain(routes['POST /restaurants/me/billing/annual/subscribe'], { restaurantId: 'r-1', operatorRole: 'dono' as never }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(annualSubscriptionService.subscribe).not.toHaveBeenCalled();
    expect(obligationIssuanceService.issuePending).not.toHaveBeenCalled();

    billingPayerRepository.findByRestaurantId.mockResolvedValue({ id: 'payer-1', restaurantId: 'r-1' });
    await expect(
      runChain(routes['POST /restaurants/me/billing/annual/subscribe'], { restaurantId: 'r-1', operatorRole: 'dono' as never }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(annualSubscriptionService.subscribe).not.toHaveBeenCalled();
  });

  it('adesão duplicada vira 409', async () => {
    const { routes, annualSubscriptionService } = setup();
    jest.spyOn(annualSubscriptionService, 'subscribe').mockRejectedValue(new AnnualAdhesionAlreadyActiveError());

    await expect(
      runChain(routes['POST /restaurants/me/billing/annual/subscribe'], { restaurantId: 'r-1', operatorRole: 'dono' as never }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('AC-11: cancelar anual JÁ PAGO chama cancelRenewal (mantém acesso até o fim, sem estorno)', async () => {
    const paidObligation = buildObligation({ status: 'paid' });
    const { routes, obligationRepository, annualSubscriptionService, reconciliationService } = setup({ obligations: [paidObligation] });
    obligationRepository.findById.mockResolvedValue(paidObligation);
    const json = jest.fn();

    await runChain(routes['POST /restaurants/me/billing/annual/cancel'], { restaurantId: 'r-1', operatorRole: 'dono' as never, user: { uid: 'u-1', email: 'dono@primepizza.com' } }, { json });

    expect(reconciliationService.reconcile).toHaveBeenCalledWith(expect.any(Date), { obligationId: 'ob-1' });
    expect(annualSubscriptionService.cancelRenewal).toHaveBeenCalled();
    expect(annualSubscriptionService.withdrawUnpaidAnnual).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ kind: 'renewal_cancelled' }));
  });

  it('AC-12: cancelar anual AINDA NÃO PAGO (depois de reconciliar) chama withdrawUnpaidAnnual', async () => {
    const unpaidObligation = buildObligation({ status: 'awaiting_issue' });
    const { routes, obligationRepository, annualSubscriptionService } = setup({ obligations: [unpaidObligation] });
    obligationRepository.findById.mockResolvedValue(unpaidObligation);
    const json = jest.fn();

    await runChain(routes['POST /restaurants/me/billing/annual/cancel'], { restaurantId: 'r-1', operatorRole: 'dono' as never, user: { uid: 'u-1', email: 'dono@primepizza.com' } }, { json });

    expect(annualSubscriptionService.withdrawUnpaidAnnual).toHaveBeenCalled();
    expect(annualSubscriptionService.cancelRenewal).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(200, { kind: 'withdrawn' });
  });

  it('REQ-33: Gerente/Caixa não cancelam a assinatura anual (403)', async () => {
    const { routes } = setup();

    await expect(
      runChain(routes['POST /restaurants/me/billing/annual/cancel'], { restaurantId: 'r-1', operatorRole: 'financeiro' as never }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('REQ-26: resumo inclui o accessStatus recalculado ao vivo (não espera o próximo ciclo)', async () => {
    const overdue = buildObligation({ status: 'overdue', amountCents: 7990, dueDate: localMidnight(new Date('2026-09-10T12:00:00Z')) });
    const { routes, obligationRepository } = setup();
    obligationRepository.findOpenByRestaurantId.mockResolvedValue([overdue]);
    const json = jest.fn();

    await runChain(routes['GET /restaurants/me/billing/summary'], { restaurantId: 'r-1', operatorRole: 'dono' as never }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ accessStatus: expect.objectContaining({ status: 'blocked' }) }));
  });

  // specs/0175-cobranca-assinatura-asaas REQ-26 — a página de regularização não pode chamar
  // `GET /restaurants/me/operators/me` (middleware COM o guard de billing, bloquearia de novo).
  it('REQ-26: resumo devolve o operatorRole, pra decidir a UI (Dono vs Gerente/Caixa) sem outra chamada bloqueada', async () => {
    const { routes } = setup();
    const json = jest.fn();

    await runChain(routes['GET /restaurants/me/billing/summary'], { restaurantId: 'r-1', operatorRole: 'financeiro' as never }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ operatorRole: 'financeiro' }));
  });

  // specs/0175 REQ-37/REQ-38 — achado na homologação (28/11/2026).
  it('AC-27: resumo devolve a assinatura com a renovação cancelada e o fim do ano pago', async () => {
    const { routes, annualSubscriptionService } = setup();
    const cancelled = { id: 'sub-1', restaurantId: 'r-1', renewalActive: false, joinedAt: new Date(), createdAt: new Date(), updatedAt: new Date() };
    const coverageEnd = new Date('2027-11-27T03:00:00Z');
    jest.spyOn(annualSubscriptionService, 'findCurrent').mockResolvedValue({ subscription: cancelled, coverageEnd });
    const json = jest.fn();

    await runChain(routes['GET /restaurants/me/billing/summary'], { restaurantId: 'r-1', operatorRole: 'dono' as never }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ annualSubscription: cancelled, annualCoverageEnd: coverageEnd }));
  });

  it('AC-28: POST annual/reactivate (Dono) religa a renovação', async () => {
    const { routes, annualSubscriptionService } = setup();
    const json = jest.fn();

    await runChain(routes['POST /restaurants/me/billing/annual/reactivate'], { restaurantId: 'r-1', operatorRole: 'dono' as never, user: { uid: 'u-1' } }, { json });

    expect(annualSubscriptionService.reactivateRenewal).toHaveBeenCalledWith('r-1', expect.any(Date));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ accessUntil: new Date('2027-11-27T03:00:00Z') }));
  });

  it('AC-28: reativar sem renovação cancelada/ano pago vira 409; Gerente/Caixa não reativam (403)', async () => {
    const { routes, annualSubscriptionService } = setup();
    jest.spyOn(annualSubscriptionService, 'reactivateRenewal').mockRejectedValue(new AnnualRenewalNotReactivatableError());

    await expect(
      runChain(routes['POST /restaurants/me/billing/annual/reactivate'], { restaurantId: 'r-1', operatorRole: 'dono' as never }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      runChain(routes['POST /restaurants/me/billing/annual/reactivate'], { restaurantId: 'r-1', operatorRole: 'financeiro' as never }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
