import { PlatformController } from './platform.controller';
import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import { IOrder } from '../../orders/domain/entities/order.entity';
import { DEFAULT_BILLING_SETTINGS } from '../../billing/domain/billing';

type Handler = (req: unknown, res: unknown) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, Handler[]> = {};
  const register = (method: string) => (path: string, ...handlers: Handler[]) => {
    routes[`${method} ${path}`] = handlers;
  };
  const application = { get: register('GET'), patch: register('PATCH'), post: register('POST') };
  return { application: application as never, routes };
}

async function run(handlers: Handler[], req: unknown, res: unknown) {
  // Pula a checagem de Firebase (tem spec própria) e executa o middleware de admin + handler.
  for (const handler of handlers.slice(1)) {
    await handler(req, res);
  }
}

function buildRestaurant(overrides: Partial<IRestaurant> = {}): IRestaurant {
  return { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', ...overrides } as IRestaurant;
}

function delivered(total: number, createdAt = '2026-10-02T12:00:00Z'): IOrder {
  return { id: `o-${total}`, total, orderNumber: 1, status: 'entregue', createdAt: new Date(createdAt) } as unknown as IOrder;
}

function setup(options: { restaurants: IRestaurant[]; ordersByRestaurant?: Record<string, IOrder[]>; lastDelivered?: Record<string, Date | null> }) {
  const restaurantRepository = {
    listAll: jest.fn().mockResolvedValue(options.restaurants),
    findById: jest.fn().mockImplementation(async (id: string) => options.restaurants.find((r) => r.id === id) ?? null),
    updateBilling: jest.fn().mockImplementation(async (id: string, billing: unknown) => buildRestaurant({ id, billing: billing as IRestaurant['billing'] })),
  };
  const orderRepository = {
    findDeliveredByRestaurantBetween: jest.fn().mockImplementation(async (id: string) => options.ordersByRestaurant?.[id] ?? []),
    findLastDeliveredAt: jest.fn().mockImplementation(async (id: string) => options.lastDelivered?.[id] ?? null),
  };
  // specs/0113-parametrizacao-faixas-cobranca — sem configuração salva nestes testes: usa o default.
  const billingSettingsRepository = { get: jest.fn().mockResolvedValue(DEFAULT_BILLING_SETTINGS), update: jest.fn() };
  // specs/0175-cobranca-assinatura-asaas.
  const obligationRepository = {
    findById: jest.fn().mockResolvedValue(null),
    findByRestaurantId: jest.fn().mockResolvedValue([]),
    findOpenByRestaurantId: jest.fn().mockResolvedValue([]),
  };
  const annualSubscriptionRepository = { findActiveByRestaurantId: jest.fn().mockResolvedValue(null) };
  const billingPayerRepository = { findByRestaurantId: jest.fn().mockResolvedValue(null) };
  const subscriptionEventRepository = { append: jest.fn().mockResolvedValue({ event: {}, wasAlreadyRecorded: false }), listByObligation: jest.fn().mockResolvedValue([]) };
  const pixAvailabilityExceptionRepository = { setAdminOverride: jest.fn().mockResolvedValue({ id: 'exc-1' }) };
  const platformBillingCycleService = { recomputeAndPersist: jest.fn().mockResolvedValue(undefined) };
  const obligationIssuanceService = { issuePending: jest.fn().mockResolvedValue(undefined) };
  const reconciliationService = { reconcile: jest.fn().mockResolvedValue(undefined) };
  const { application, routes } = buildFakeApplication();
  new PlatformController(
    restaurantRepository as never, orderRepository as never, (async () => undefined) as never, billingSettingsRepository as never,
    obligationRepository as never, annualSubscriptionRepository as never, billingPayerRepository as never, subscriptionEventRepository as never,
    pixAvailabilityExceptionRepository as never, platformBillingCycleService as never, obligationIssuanceService as never, reconciliationService as never,
  ).initializeRoutes(application);
  return {
    restaurantRepository, orderRepository, routes, obligationRepository, annualSubscriptionRepository, billingPayerRepository,
    subscriptionEventRepository, pixAvailabilityExceptionRepository, platformBillingCycleService, obligationIssuanceService, reconciliationService,
  };
}

describe('PlatformController (specs/0106)', () => {
  it('AC-2: lista todos os restaurantes com faturamento do mês, plano, status e último pedido', async () => {
    const billing = { referenceMonth: '2026-10', currentTier: 'pro' as const, notified75Percent: false, notifiedTierUpgrade: false, status: 'blocked' as const, cycle: 'monthly' as const };
    const { routes } = setup({
      restaurants: [buildRestaurant({ id: 'r-1', billing }), buildRestaurant({ id: 'r-2', name: 'Burger', slug: 'burger' })],
      ordersByRestaurant: { 'r-1': [delivered(1500), delivered(700)] },
      lastDelivered: { 'r-1': new Date('2026-10-02T12:00:00Z') },
    });
    const json = jest.fn();

    await run(routes['GET /platform/restaurants'], {}, { json });

    const rows = json.mock.calls[0][1];
    expect(rows[0]).toMatchObject({ id: 'r-1', tier: 'pro', status: 'blocked', blocked: true, revenueCents: 220000, lastDeliveredAt: '2026-10-02T12:00:00.000Z' });
    expect(rows[1]).toMatchObject({ id: 'r-2', tier: 'free', status: 'ok', blocked: false, revenueCents: 0, lastDeliveredAt: null });
  });

  it('AC-3: bloquear grava status blocked e mantém faixa e ciclo', async () => {
    const billing = { referenceMonth: '2026-10', currentTier: 'pro' as const, notified75Percent: true, notifiedTierUpgrade: false, status: 'ok' as const, cycle: 'annual' as const };
    const { restaurantRepository, routes } = setup({ restaurants: [buildRestaurant({ billing })] });
    const json = jest.fn();

    await run(routes['PATCH /platform/restaurants/:id/billing'], { params: { id: 'r-1' }, body: { status: 'blocked' } }, { json });

    expect(restaurantRepository.updateBilling).toHaveBeenCalledWith('r-1', expect.objectContaining({ status: 'blocked', cycle: 'annual', currentTier: 'pro', notified75Percent: true }));
  });

  it('AC-3: desbloquear grava status ok', async () => {
    const billing = { referenceMonth: '2026-10', currentTier: 'pro' as const, notified75Percent: false, notifiedTierUpgrade: false, status: 'blocked' as const, cycle: 'monthly' as const };
    const { restaurantRepository, routes } = setup({ restaurants: [buildRestaurant({ billing })] });

    await run(routes['PATCH /platform/restaurants/:id/billing'], { params: { id: 'r-1' }, body: { status: 'ok' } }, { json: jest.fn() });

    expect(restaurantRepository.updateBilling).toHaveBeenCalledWith('r-1', expect.objectContaining({ status: 'ok' }));
  });

  // specs/0175-cobranca-assinatura-asaas REQ-17/"Relação com regras anteriores" — `cycle` saiu
  // deste PATCH de propósito (anual só existe via contratação real, `PlatformBillingController`);
  // `{ cycle: 'annual' }` sozinho (sem `status`) agora é rejeitado — `cycle` é silenciosamente
  // ignorado pelo schema (campo desconhecido) e `status`, agora obrigatório, está ausente.
  it('REQ-17: "cycle" não é mais aceito por este PATCH — corpo só com cycle é rejeitado (status ausente)', async () => {
    const billing = { referenceMonth: '2026-10', currentTier: 'pro' as const, notified75Percent: false, notifiedTierUpgrade: false, status: 'blocked' as const, cycle: 'monthly' as const };
    const { restaurantRepository, routes } = setup({ restaurants: [buildRestaurant({ billing })] });

    await expect(
      run(routes['PATCH /platform/restaurants/:id/billing'], { params: { id: 'r-1' }, body: { cycle: 'annual' } }, { json: jest.fn() }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(restaurantRepository.updateBilling).not.toHaveBeenCalled();
  });

  it('corpo vazio ou com valor inválido é recusado sem gravar', async () => {
    const { restaurantRepository, routes } = setup({ restaurants: [buildRestaurant()] });

    await expect(run(routes['PATCH /platform/restaurants/:id/billing'], { params: { id: 'r-1' }, body: {} }, { json: jest.fn() })).rejects.toMatchObject({ statusCode: 400 });
    await expect(run(routes['PATCH /platform/restaurants/:id/billing'], { params: { id: 'r-1' }, body: { status: 'talvez' } }, { json: jest.fn() })).rejects.toMatchObject({ statusCode: 400 });
    expect(restaurantRepository.updateBilling).not.toHaveBeenCalled();
  });

  it('restaurante inexistente recebe 404', async () => {
    const { restaurantRepository, routes } = setup({ restaurants: [] });

    await expect(run(routes['PATCH /platform/restaurants/:id/billing'], { params: { id: 'x' }, body: { status: 'ok' } }, { json: jest.fn() })).rejects.toMatchObject({ statusCode: 404 });
    expect(restaurantRepository.updateBilling).not.toHaveBeenCalled();
  });

  // specs/0175-cobranca-assinatura-asaas.
  describe('visão administrativa da assinatura (REQ-31/REQ-32)', () => {
    it('REQ-31: GET /platform/billing/restaurants mostra dívida em aberto e pendência técnica', async () => {
      const { routes, obligationRepository } = setup({ restaurants: [buildRestaurant({ id: 'r-1' })] });
      obligationRepository.findOpenByRestaurantId.mockResolvedValue([
        { id: 'ob-1', amountCents: 7990, status: 'overdue' },
        { id: 'ob-2', amountCents: 7990, status: 'issue_failed' },
      ]);
      const json = jest.fn();

      await run(routes['GET /platform/billing/restaurants'], {}, { json });

      expect(json).toHaveBeenCalledWith(200, [
        expect.objectContaining({ id: 'r-1', openObligationsCount: 2, totalDueCents: 15980, hasPendingTechnicalIssue: true }),
      ]);
    });

    it('REQ-34/AC-25: cycle "annual" legado sem IAnnualSubscription aparece como pendência (hasLegacyAnnualConflict)', async () => {
      const billing = { referenceMonth: '2026-10', currentTier: 'pro' as const, notified75Percent: false, notifiedTierUpgrade: false, status: 'ok' as const, cycle: 'annual' as const };
      const { routes } = setup({ restaurants: [buildRestaurant({ billing })] });
      const json = jest.fn();

      await run(routes['GET /platform/billing/restaurants'], {}, { json });

      expect(json).toHaveBeenCalledWith(200, [expect.objectContaining({ hasLegacyAnnualConflict: true })]);
    });

    it('REQ-32: GET /platform/billing/restaurants/:id devolve histórico de obligations com seus eventos', async () => {
      const { routes, obligationRepository, subscriptionEventRepository } = setup({ restaurants: [buildRestaurant({ id: 'r-1' })] });
      obligationRepository.findByRestaurantId.mockResolvedValue([{ id: 'ob-1', status: 'paid' }]);
      subscriptionEventRepository.listByObligation.mockResolvedValue([{ id: 'ev-1', type: 'webhook_received' }]);
      const json = jest.fn();

      await run(routes['GET /platform/billing/restaurants/:id'], { params: { id: 'r-1' } }, { json });

      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
        obligations: [expect.objectContaining({ id: 'ob-1', events: [{ id: 'ev-1', type: 'webhook_received' }] })],
      }));
    });

    it('GET /platform/billing/restaurants/:id de restaurante inexistente é 404', async () => {
      const { routes } = setup({ restaurants: [] });

      await expect(run(routes['GET /platform/billing/restaurants/:id'], { params: { id: 'x' } }, { json: jest.fn() })).rejects.toMatchObject({ statusCode: 404 });
    });

    it('REQ-32: POST .../reprocess emite pendentes, reconcilia e recalcula o acesso, escopado ao restaurante', async () => {
      const { routes, obligationIssuanceService, reconciliationService, platformBillingCycleService } = setup({ restaurants: [buildRestaurant({ id: 'r-1' })] });
      const json = jest.fn();

      await run(routes['POST /platform/billing/restaurants/:id/reprocess'], { params: { id: 'r-1' } }, { json });

      expect(obligationIssuanceService.issuePending).toHaveBeenCalledWith(expect.any(Date), 'r-1');
      expect(reconciliationService.reconcile).toHaveBeenCalledWith(expect.any(Date), { restaurantId: 'r-1' });
      expect(platformBillingCycleService.recomputeAndPersist).toHaveBeenCalledWith('r-1', expect.any(Date));
      expect(json).toHaveBeenCalledWith(200, { reprocessed: true });
    });

    it('REQ-32: POST /platform/billing/exceptions grava a exceção auditada (motivo/autoria) e recalcula o acesso', async () => {
      const { routes, obligationRepository, pixAvailabilityExceptionRepository, subscriptionEventRepository, platformBillingCycleService } = setup({ restaurants: [buildRestaurant()] });
      obligationRepository.findById.mockResolvedValue({ id: 'ob-1', restaurantId: 'r-1' });
      const json = jest.fn();
      const req = { body: { obligationId: 'ob-1', reason: 'Falha reconhecida da plataforma', graceDeadline: '2026-11-15T03:00:00.000Z' }, user: { email: 'admin@bsdelivery.com.br' } };

      await run(routes['POST /platform/billing/exceptions'], req, { json });

      expect(pixAvailabilityExceptionRepository.setAdminOverride).toHaveBeenCalledWith('ob-1', new Date('2026-11-15T03:00:00.000Z'), expect.any(Date));
      expect(subscriptionEventRepository.append).toHaveBeenCalledWith(expect.objectContaining({
        obligationId: 'ob-1', type: 'manual_exception', actor: 'admin@bsdelivery.com.br',
        payload: { reason: 'Falha reconhecida da plataforma', graceDeadline: '2026-11-15T03:00:00.000Z' },
      }));
      expect(platformBillingCycleService.recomputeAndPersist).toHaveBeenCalledWith('r-1', expect.any(Date));
    });

    it('POST /platform/billing/exceptions com obligationId inexistente é 404', async () => {
      const { routes } = setup({ restaurants: [] });
      const req = { body: { obligationId: 'ob-inexistente', reason: 'x', graceDeadline: '2026-11-15T03:00:00.000Z' }, user: { email: 'admin@bsdelivery.com.br' } };

      await expect(run(routes['POST /platform/billing/exceptions'], req, { json: jest.fn() })).rejects.toMatchObject({ statusCode: 404 });
    });

    it('POST /platform/billing/exceptions sem motivo é rejeitado (400)', async () => {
      const { routes } = setup({ restaurants: [] });
      const req = { body: { obligationId: 'ob-1', reason: '', graceDeadline: '2026-11-15T03:00:00.000Z' }, user: { email: 'admin@bsdelivery.com.br' } };

      await expect(run(routes['POST /platform/billing/exceptions'], req, { json: jest.fn() })).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
