import type { Request, Response, Server } from 'restify';

import { ICashRegisterRepository } from '../domain/repositories/cash-register.repository.interface';
import { CashClosingSummary, ICashRegisterService } from '../domain/services/i-cash-register.service';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { CashRegisterController } from './cash-register.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'query'>> & { restaurantId?: string; user?: { uid: string } };
type FakeResponse = Pick<Response, 'json'>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    get: (path: string, ...handlers: RouteHandler[]) => {
      routes[`GET ${path}`] = handlers;
    },
    post: (path: string, ...handlers: RouteHandler[]) => {
      routes[`POST ${path}`] = handlers;
    },
  };
  return { application: application as unknown as Server, routes };
}

async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(3)) {
    await handler(req, res);
  }
}

function buildSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cr-1',
    restaurantId: 'r-1',
    openedAt: '2026-09-09T08:00:00.000Z',
    openingBalance: 100,
    status: 'aberto',
    openedBy: 'operator-1',
    ...overrides,
  };
}

function buildMovement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mv-1',
    cashRegisterSessionId: 'cr-1',
    type: 'entrada',
    amount: 50,
    description: 'Venda #1 (Pix)',
    createdAt: '2026-09-09T09:00:00.000Z',
    ...overrides,
  };
}

function buildDeliveredOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o-1',
    orderNumber: 1,
    restaurantId: 'r-1',
    orderType: 'delivery',
    status: 'entregue',
    deliveryFee: 8,
    deliveryMotoboy: { id: 'm-1', name: 'Carlos' },
    statusHistory: [{ status: 'entregue', changedAt: '2026-10-10T12:00:00.000Z' }],
    ...overrides,
  };
}

function buildClosedTableOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o-1',
    orderNumber: 1,
    restaurantId: 'r-1',
    orderType: 'table',
    status: 'entregue',
    serviceChargeAmount: 5,
    tableWaiter: { id: 'w-1', name: 'Ana' },
    tableClosedAt: '2026-10-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('CashRegisterController', () => {
  function setup(overrides: {
    cashRegisterRepository?: Partial<ICashRegisterRepository>;
    orderRepository?: Partial<IOrderRepository>;
    cashRegisterService?: Partial<ICashRegisterService>;
  } = {}) {
    const cashRegisterRepository: Partial<ICashRegisterRepository> = {
      findOpenSessionByRestaurant: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(buildSession()),
      open: jest.fn().mockResolvedValue(buildSession()),
      addMovement: jest.fn().mockResolvedValue(buildMovement()),
      listMovements: jest.fn().mockResolvedValue([buildMovement()]),
      getCalculatedBalance: jest.fn().mockResolvedValue(150),
      close: jest.fn().mockResolvedValue({ session: buildSession({ status: 'fechado', closingBalance: 150 }), calculatedBalance: 150, difference: 0 }),
      findClosedSessionsBetween: jest.fn().mockResolvedValue([]),
      findManualMovementsByRestaurantBetween: jest.fn().mockResolvedValue([]),
      ...overrides.cashRegisterRepository,
    };
    const orderRepository: Partial<IOrderRepository> = {
      findDeliveredByRestaurantCompletedBetween: jest.fn().mockResolvedValue([]),
      findClosedTableOrders: jest.fn().mockResolvedValue([]),
      getTableSalesBetween: jest.fn().mockResolvedValue(75),
      ...overrides.orderRepository,
    };
    // specs/0118-controle-caixa-automatico-redes-sociais — `ensureAutomaticSchedule` mockado como
    // no-op por padrão: estes testes cobrem as rotas em si, a lógica do "cron" lazy já tem
    // cobertura própria em `cash-register.service.spec.ts`.
    const cashRegisterService: Partial<ICashRegisterService> = {
      ensureAutomaticSchedule: jest.fn().mockResolvedValue(undefined),
      getBalanceByPaymentMethod: jest.fn().mockResolvedValue({}),
      getClosingSummary: jest.fn().mockResolvedValue({
        session: buildSession({ status: 'fechado' }),
        balanceByPaymentMethod: {},
        totalSales: 0,
        calculatedBalance: 0,
        difference: 0,
      }),
      ...overrides.cashRegisterService,
    };
    const restaurantOperatorMiddleware = jest.fn(async () => {});
    const { application, routes } = buildFakeApplication();
    new CashRegisterController(
      cashRegisterRepository as ICashRegisterRepository,
      orderRepository as IOrderRepository,
      cashRegisterService as ICashRegisterService,
      restaurantOperatorMiddleware,
    ).initializeRoutes(application);
    return { cashRegisterRepository, orderRepository, cashRegisterService, routes };
  }

  it('specs/0127 AC-1/AC-2: agrupa taxa integral por motoboy e separa pedidos sem atribuição', async () => {
    const from = '2026-10-10T00:00:00.000Z';
    const to = '2026-10-11T00:00:00.000Z';
    const orders = [
      buildDeliveredOrder({ id: 'o-1', orderNumber: 1, deliveryFee: 8 }),
      buildDeliveredOrder({ id: 'o-2', orderNumber: 2, deliveryFee: 12 }),
      buildDeliveredOrder({ id: 'o-3', orderNumber: 3, deliveryFee: 5, deliveryMotoboy: undefined }),
    ];
    const { orderRepository, routes } = setup({
      orderRepository: { findDeliveredByRestaurantCompletedBetween: jest.fn().mockResolvedValue(orders) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/cash-register/motoboy-payouts'],
      { restaurantId: 'r-1', query: { from, to } },
      { json },
    );

    expect(orderRepository.findDeliveredByRestaurantCompletedBetween).toHaveBeenCalledWith('r-1', new Date(from), new Date(to));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
      totalDue: 20,
      motoboys: [expect.objectContaining({ motoboyId: 'm-1', motoboyName: 'Carlos', orderCount: 2, totalDue: 20 })],
      unassignedOrderCount: 1,
      unassignedDeliveryFees: 5,
    }));
  });

  it('specs/0127: rejeita período de repasse inválido', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(
        routes['GET /restaurants/me/cash-register/motoboy-payouts'],
        { restaurantId: 'r-1', query: { from: 'amanhã', to: 'hoje' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('specs/0136 AC-2/AC-3: agrupa taxa de serviço por garçom e separa pedidos sem atribuição', async () => {
    const from = '2026-10-10T00:00:00.000Z';
    const to = '2026-10-11T00:00:00.000Z';
    const orders = [
      buildClosedTableOrder({ id: 'o-1', orderNumber: 1, serviceChargeAmount: 5 }),
      buildClosedTableOrder({ id: 'o-2', orderNumber: 2, serviceChargeAmount: 7 }),
      buildClosedTableOrder({ id: 'o-3', orderNumber: 3, serviceChargeAmount: 3, tableWaiter: undefined }),
    ];
    const { orderRepository, routes } = setup({
      orderRepository: { findClosedTableOrders: jest.fn().mockResolvedValue(orders) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/cash-register/waiter-payouts'],
      { restaurantId: 'r-1', query: { from, to } },
      { json },
    );

    expect(orderRepository.findClosedTableOrders).toHaveBeenCalledWith('r-1', new Date(from), new Date(to));
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
      totalDue: 12,
      waiters: [expect.objectContaining({ waiterId: 'w-1', waiterName: 'Ana', orderCount: 2, totalDue: 12 })],
      unassignedOrderCount: 1,
      unassignedServiceCharges: 3,
    }));
  });

  it('specs/0136: pedido sem taxa de serviço soma 0, sem quebrar o agrupamento', async () => {
    const orders = [buildClosedTableOrder({ serviceChargeAmount: undefined })];
    const { routes } = setup({ orderRepository: { findClosedTableOrders: jest.fn().mockResolvedValue(orders) } });
    const json = jest.fn();

    await runOperatorChain(
      routes['GET /restaurants/me/cash-register/waiter-payouts'],
      { restaurantId: 'r-1', query: { from: '2026-10-10T00:00:00.000Z', to: '2026-10-11T00:00:00.000Z' } },
      { json },
    );

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
      totalDue: 0,
      waiters: [expect.objectContaining({ waiterId: 'w-1', orderCount: 1, totalDue: 0 })],
    }));
  });

  it('specs/0136: rejeita período de repasse inválido', async () => {
    const { routes } = setup();

    await expect(
      runOperatorChain(
        routes['GET /restaurants/me/cash-register/waiter-payouts'],
        { restaurantId: 'r-1', query: { from: 'amanhã', to: 'hoje' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('GET /restaurants/me/cash-register/open devolve session:null quando não há sessão aberta', async () => {
    const { cashRegisterService, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/cash-register/open'], { restaurantId: 'r-1' }, { json });

    expect(json).toHaveBeenCalledWith(200, { session: null, movements: [], calculatedBalance: 0, tableSales: 0, balanceByPaymentMethod: {} });
    expect(cashRegisterService.ensureAutomaticSchedule).toHaveBeenCalledWith('r-1');
  });

  it('GET /restaurants/me/cash-register/open devolve a sessão aberta com movimentos, saldo calculado e saldo por forma de pagamento (REQ-9)', async () => {
    const { orderRepository, cashRegisterService, routes } = setup({
      cashRegisterRepository: { findOpenSessionByRestaurant: jest.fn().mockResolvedValue(buildSession()) },
      cashRegisterService: { getBalanceByPaymentMethod: jest.fn().mockResolvedValue({ pix: 100, cash: 30 }) },
    });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/cash-register/open'], { restaurantId: 'r-1' }, { json });

    expect(json).toHaveBeenCalledWith(200, {
      session: expect.objectContaining({ id: 'cr-1' }),
      movements: [expect.objectContaining({ id: 'mv-1' })],
      calculatedBalance: 150,
      tableSales: 75,
      balanceByPaymentMethod: { pix: 100, cash: 30 },
    });
    expect(orderRepository.getTableSalesBetween).toHaveBeenCalledWith('r-1', new Date('2026-09-09T08:00:00.000Z'), expect.any(Date));
    expect(cashRegisterService.getBalanceByPaymentMethod).toHaveBeenCalledWith('cr-1');
  });

  it('AC-4: POST /restaurants/me/cash-register/open abre uma sessão com o valor inicial informado', async () => {
    const { cashRegisterRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/cash-register/open'],
      { restaurantId: 'r-1', user: { uid: 'operator-1' }, body: { openingBalance: 100 } },
      { json },
    );

    expect(cashRegisterRepository.open).toHaveBeenCalledWith('r-1', 100, 'operator-1');
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ status: 'aberto' }));
  });

  it('AC-8: POST /restaurants/me/cash-register/open bloqueia e indica a sessão já aberta', async () => {
    const { cashRegisterRepository, routes } = setup({
      cashRegisterRepository: { findOpenSessionByRestaurant: jest.fn().mockResolvedValue(buildSession()) },
    });

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/cash-register/open'],
        { restaurantId: 'r-1', user: { uid: 'operator-1' }, body: { openingBalance: 100 } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('cr-1') });
    expect(cashRegisterRepository.open).not.toHaveBeenCalled();
  });

  it('AC-6: POST .../:id/movements lança um movimento manual (sangria) numa sessão aberta', async () => {
    const { cashRegisterRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/cash-register/:id/movements'],
      { restaurantId: 'r-1', params: { id: 'cr-1' }, body: { type: 'saida', amount: 30, description: 'Sangria' } },
      { json },
    );

    expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-1', { type: 'saida', amount: 30, description: 'Sangria' });
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ id: 'mv-1' }));
  });

  it('POST .../:id/movements rejeita lançamento numa sessão já fechada', async () => {
    const { cashRegisterRepository, routes } = setup({
      cashRegisterRepository: { findById: jest.fn().mockResolvedValue(buildSession({ status: 'fechado' })) },
    });

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/cash-register/:id/movements'],
        { restaurantId: 'r-1', params: { id: 'cr-1' }, body: { type: 'entrada', amount: 30, description: 'X' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(cashRegisterRepository.addMovement).not.toHaveBeenCalled();
  });

  it('lança 404 ao lançar movimento numa sessão de outro restaurante', async () => {
    const { routes } = setup({
      cashRegisterRepository: { findById: jest.fn().mockResolvedValue(buildSession({ restaurantId: 'r-OUTRO' })) },
    });

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/cash-register/:id/movements'],
        { restaurantId: 'r-1', params: { id: 'cr-1' }, body: { type: 'entrada', amount: 30, description: 'X' } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('AC-7: POST .../:id/close mostra a diferença entre o saldo calculado e o valor contado', async () => {
    const { cashRegisterRepository, orderRepository, routes } = setup({
      cashRegisterRepository: {
        close: jest.fn().mockResolvedValue({
          session: buildSession({ status: 'fechado', closingBalance: 140 }),
          calculatedBalance: 150,
          difference: -10,
        }),
      },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/cash-register/:id/close'],
      { restaurantId: 'r-1', user: { uid: 'operator-1' }, params: { id: 'cr-1' }, body: { countedValue: 140 } },
      { json },
    );

    expect(cashRegisterRepository.close).toHaveBeenCalledWith('cr-1', 140, 'operator-1');
    expect(json).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ calculatedBalance: 150, difference: -10, tableSales: 75, session: expect.objectContaining({ status: 'fechado' }) }),
    );
    expect(orderRepository.getTableSalesBetween).toHaveBeenCalledWith('r-1', new Date('2026-09-09T08:00:00.000Z'), expect.any(Date));
  });

  it('POST .../:id/close rejeita fechar uma sessão já fechada', async () => {
    const { cashRegisterRepository, routes } = setup({
      cashRegisterRepository: { findById: jest.fn().mockResolvedValue(buildSession({ status: 'fechado' })) },
    });

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/cash-register/:id/close'],
        { restaurantId: 'r-1', params: { id: 'cr-1' }, body: { countedValue: 100 } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(cashRegisterRepository.close).not.toHaveBeenCalled();
  });

  describe('GET /restaurants/me/cash-register/history (REQ-10)', () => {
    it('AC-7: 3 fechamentos no período devolvem o resumo de cada um', async () => {
      const from = '2026-10-01T00:00:00.000Z';
      const to = '2026-10-31T23:59:59.000Z';
      const closedSessions = [
        buildSession({ id: 'cr-1', status: 'fechado' }),
        buildSession({ id: 'cr-2', status: 'fechado' }),
        buildSession({ id: 'cr-3', status: 'fechado' }),
      ];
      const summaryFor = (id: string): CashClosingSummary => ({
        session: closedSessions.find((session) => session.id === id) as CashClosingSummary['session'],
        balanceByPaymentMethod: { pix: 100 },
        totalSales: 100,
        calculatedBalance: 100,
        difference: 0,
      });
      const { cashRegisterRepository, cashRegisterService, routes } = setup({
        cashRegisterRepository: { findClosedSessionsBetween: jest.fn().mockResolvedValue(closedSessions) },
        cashRegisterService: {
          getClosingSummary: jest.fn((id: string) => Promise.resolve(summaryFor(id))),
        },
      });
      const json = jest.fn();

      await runOperatorChain(routes['GET /restaurants/me/cash-register/history'], { restaurantId: 'r-1', query: { from, to } }, { json });

      expect(cashRegisterRepository.findClosedSessionsBetween).toHaveBeenCalledWith('r-1', new Date(from), new Date(to));
      expect(cashRegisterService.getClosingSummary).toHaveBeenCalledTimes(3);
      expect(json).toHaveBeenCalledWith(200, {
        from,
        to,
        closings: [summaryFor('cr-1'), summaryFor('cr-2'), summaryFor('cr-3')],
      });
    });

    it('rejeita período inválido', async () => {
      const { routes } = setup();

      await expect(
        runOperatorChain(
          routes['GET /restaurants/me/cash-register/history'],
          { restaurantId: 'r-1', query: { from: 'amanhã', to: 'hoje' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('GET /restaurants/me/cash-register/movements (REQ-11)', () => {
    it('AC-8: devolve só os movimentos manuais (sem orderId) do período, não as vendas automáticas', async () => {
      const from = '2026-10-01T00:00:00.000Z';
      const to = '2026-10-31T23:59:59.000Z';
      const manualMovements = [
        buildMovement({ id: 'mv-entrada', type: 'entrada', description: 'Suprimento' }),
        buildMovement({ id: 'mv-saida', type: 'saida', description: 'Sangria' }),
      ];
      const { cashRegisterRepository, routes } = setup({
        cashRegisterRepository: { findManualMovementsByRestaurantBetween: jest.fn().mockResolvedValue(manualMovements) },
      });
      const json = jest.fn();

      await runOperatorChain(routes['GET /restaurants/me/cash-register/movements'], { restaurantId: 'r-1', query: { from, to } }, { json });

      expect(cashRegisterRepository.findManualMovementsByRestaurantBetween).toHaveBeenCalledWith('r-1', new Date(from), new Date(to));
      expect(json).toHaveBeenCalledWith(200, { from, to, movements: manualMovements });
    });

    it('rejeita período inválido', async () => {
      const { routes } = setup();

      await expect(
        runOperatorChain(
          routes['GET /restaurants/me/cash-register/movements'],
          { restaurantId: 'r-1', query: { from: 'amanhã', to: 'hoje' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
