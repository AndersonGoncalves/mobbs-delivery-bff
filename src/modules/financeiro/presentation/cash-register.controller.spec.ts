import type { Request, Response, Server } from 'restify';
import { ConflictError } from 'restify-errors';

import { ICashRegisterRepository } from '../domain/repositories/cash-register.repository.interface';
import { IRestaurantOperatorRepository } from '../../restaurant-operators/domain/repositories/restaurant-operator.repository.interface';
import { CashClosingSummary, ICashRegisterService } from '../domain/services/i-cash-register.service';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { CashRegisterController } from './cash-register.controller';

type FakeRequest = Partial<Pick<Request, 'params' | 'body' | 'query'>> & { restaurantId?: string; user?: { uid: string }; operatorRole?: string; operatorId?: string };
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
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-09-09T12:00:00Z')); });
  afterEach(() => jest.useRealTimers());
  function setup(overrides: {
    cashRegisterRepository?: Partial<ICashRegisterRepository>;
    orderRepository?: Partial<IOrderRepository>;
    cashRegisterService?: Partial<ICashRegisterService>;
    restaurantOperatorRepository?: Partial<IRestaurantOperatorRepository>;
  } = {}) {
    const cashRegisterRepository: Partial<ICashRegisterRepository> = {
      findOpenSessionByRestaurant: jest.fn().mockResolvedValue(null),
      findSessionByDate: overrides.cashRegisterRepository?.findOpenSessionByRestaurant ?? jest.fn().mockResolvedValue(null),
      findClosedSessionsForDate: jest.fn().mockResolvedValue([]),
      findPendingSessions: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(buildSession()),
      open: jest.fn().mockResolvedValue(buildSession()),
      addMovement: jest.fn().mockResolvedValue(buildMovement()),
      listMovements: jest.fn().mockResolvedValue([buildMovement()]),
      getCalculatedBalance: jest.fn().mockResolvedValue(150),
      close: jest.fn().mockResolvedValue({ session: buildSession({ status: 'fechado', closingBalance: 150 }), calculatedBalance: 150, difference: 0 }),
      reopen: jest.fn().mockResolvedValue(buildSession({ status: 'aberto' })),
      findClosedSessionsBetween: jest.fn().mockResolvedValue([]),
      findMovementsByRestaurantBetween: jest.fn().mockResolvedValue([]),
      ...overrides.cashRegisterRepository,
    };
    const orderRepository: Partial<IOrderRepository> = {
      findDeliveredByRestaurantCompletedBetween: jest.fn().mockResolvedValue([]),
      findClosedTableOrders: jest.fn().mockResolvedValue([]),
      getTableSalesBetween: jest.fn().mockResolvedValue(75),
      getDeliverySalesBetween: jest.fn().mockResolvedValue(40),
      ...overrides.orderRepository,
    };
    // specs/0118-controle-caixa-automatico-redes-sociais — `ensureAutomaticSchedule` mockado como
    // no-op por padrão: estes testes cobrem as rotas em si, a lógica do "cron" lazy já tem
    // cobertura própria em `cash-register.service.spec.ts`.
    const cashRegisterService: Partial<ICashRegisterService> = {
      ensureAutomaticSchedule: jest.fn().mockResolvedValue(undefined),
      syncOpenSession: jest.fn().mockResolvedValue(undefined),
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
    // specs/0220-operador-no-fechamento-caixa — vazio por padrão: a maioria dos testes não
    // precisa resolver nome nenhum (sem `openedBy`/`closedBy` nos mocks de sessão).
    const restaurantOperatorRepository: Partial<IRestaurantOperatorRepository> = {
      findManyByIds: jest.fn().mockResolvedValue([]),
      ...overrides.restaurantOperatorRepository,
    };
    const { application, routes } = buildFakeApplication();
    new CashRegisterController(
      cashRegisterRepository as ICashRegisterRepository,
      orderRepository as IOrderRepository,
      cashRegisterService as ICashRegisterService,
      restaurantOperatorMiddleware,
      restaurantOperatorRepository as IRestaurantOperatorRepository,
    ).initializeRoutes(application);
    return { cashRegisterRepository, orderRepository, cashRegisterService, restaurantOperatorRepository, routes };
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

    expect(json).toHaveBeenCalledWith(200, { session: null, pendingSessions: [], todayClosedSessions: [], movements: [], calculatedBalance: 0, tableSales: 0, deliverySales: 0, balanceByPaymentMethod: {} });
    expect(cashRegisterService.ensureAutomaticSchedule).toHaveBeenCalledWith('r-1');
  });

  // specs/0219-multiplas-sessoes-caixa-por-dia REQ-3 — alimenta o seletor "Caixa para
  // conferência" (web) com as sessões fechadas de hoje, pode ter mais de uma (turnos).
  it('specs/0219: GET /restaurants/me/cash-register/open lista as sessões fechadas de hoje quando não há caixa aberto', async () => {
    const closedMorning = buildSession({ id: 'cr-manha', status: 'fechado' });
    const { routes } = setup({
      cashRegisterRepository: { findClosedSessionsForDate: jest.fn().mockResolvedValue([closedMorning]) },
    });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/cash-register/open'], { restaurantId: 'r-1' }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ session: null, todayClosedSessions: [expect.objectContaining(closedMorning)] }));
  });

  it('0176: consulta e fecha caixa pendente individualmente, sem alterar outros caixas', async () => {
    const previous = buildSession({ id: 'yesterday', openedAt: '2026-09-08T11:00:00Z' });
    const { routes, cashRegisterRepository, cashRegisterService, orderRepository } = setup({
      cashRegisterRepository: {
        findById: jest.fn().mockResolvedValue(previous),
        findPendingSessions: jest.fn().mockResolvedValue([previous, buildSession()]),
        close: jest.fn().mockResolvedValue({ session: { ...previous, status: 'fechado' }, calculatedBalance: 150, difference: 0 }),
      },
    });
    const json = jest.fn();
    await runOperatorChain(routes['GET /restaurants/me/cash-register/:id'], { restaurantId: 'r-1', params: { id: 'yesterday' } }, { json });
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ session: expect.objectContaining(previous), pendingSessions: expect.any(Array) }));
    // Pedido explícito do usuário (follow-up, achado real 06/11/2026) — caixa pendente ainda
    // aberto soma até "agora" (sem teto de meia-noite), ver `cashRegisterPeriodEnd`.
    expect(orderRepository.getTableSalesBetween).toHaveBeenCalledWith('r-1', new Date(previous.openedAt), new Date('2026-09-09T12:00:00Z'));
    await runOperatorChain(routes['POST /restaurants/me/cash-register/:id/close'], {
      restaurantId: 'r-1', params: { id: 'yesterday' }, body: { countedValue: 150 }, user: { uid: 'operator' }, operatorId: 'operator',
    }, { json });
    expect(cashRegisterService.syncOpenSession).toHaveBeenCalledWith('r-1', 'yesterday');
    expect(cashRegisterRepository.close).toHaveBeenCalledWith('yesterday', 150, 'operator');
  });

  // specs/0219-multiplas-sessoes-caixa-por-dia (achado real, pedido explícito do usuário) —
  // `GET .../:id` tinha ficado sem `todayClosedSessions`; ao selecionar qualquer sessão no
  // seletor "Caixa para conferência", a lista de sessões fechadas de hoje sumia do combobox web.
  it('specs/0219: GET /restaurants/me/cash-register/:id também devolve as sessões fechadas de hoje', async () => {
    const closedToday = buildSession({ id: 'cr-fechado-hoje', status: 'fechado' });
    const { routes } = setup({
      cashRegisterRepository: { findClosedSessionsForDate: jest.fn().mockResolvedValue([closedToday]) },
    });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/cash-register/:id'], { restaurantId: 'r-1', params: { id: 'cr-1' } }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ todayClosedSessions: [expect.objectContaining(closedToday)] }));
  });

  // specs/0219-multiplas-sessoes-caixa-por-dia (achado real, pedido explícito do usuário) — mesmo
  // ajuste de `GET .../open`: ao selecionar uma sessão fechada de hoje no seletor, a sessão
  // aberta (de outro turno) não pode aparecer duplicada em `pendingSessions`.
  it('specs/0219: GET /restaurants/me/cash-register/:id não duplica a sessão aberta em pendingSessions', async () => {
    const closedSelected = buildSession({ id: 'cr-fechado-selecionado', status: 'fechado' });
    const openNow = buildSession({ id: 'cr-aberto-agora' });
    const { routes } = setup({
      cashRegisterRepository: {
        findById: jest.fn().mockResolvedValue(closedSelected),
        findOpenSessionByRestaurant: jest.fn().mockResolvedValue(openNow),
        findPendingSessions: jest.fn().mockResolvedValue([openNow]),
      },
    });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/cash-register/:id'], { restaurantId: 'r-1', params: { id: 'cr-fechado-selecionado' } }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ pendingSessions: [] }));
  });

  it('0176: consulta por id não revela caixa de outro restaurante', async () => {
    const { routes } = setup({ cashRegisterRepository: { findById: jest.fn().mockResolvedValue(buildSession({ restaurantId: 'another' })) } });
    await expect(runOperatorChain(routes['GET /restaurants/me/cash-register/:id'], { restaurantId: 'r-1', params: { id: 'cr-1' } }, { json: jest.fn() }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  // Pedido explícito do usuário (follow-up, achado real 06/11/2026) — inverte o teste "0176"
  // antigo: um lançamento manual (ex. sangria) num caixa aberto desde antes da meia-noite, ainda
  // não fechado, precisa continuar funcionando — "sessão está aberta" já é a checagem certa.
  it('aceita lançamento manual num caixa aberto desde uma data civil anterior (sem teto de meia-noite)', async () => {
    const { routes, cashRegisterRepository } = setup({ cashRegisterRepository: {
      findById: jest.fn().mockResolvedValue(buildSession({ openedAt: '2026-09-08T12:00:00Z' })),
    } });
    const json = jest.fn();
    await runOperatorChain(routes['POST /restaurants/me/cash-register/:id/movements'], {
      restaurantId: 'r-1', params: { id: 'cr-1' }, body: { type: 'entrada', amount: 10, description: 'Hoje' },
    }, { json });
    expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-1', expect.objectContaining({ amount: 10, description: 'Hoje' }));
    expect(json).toHaveBeenCalledWith(201, expect.anything());
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
      pendingSessions: [],
      // specs/0219-multiplas-sessoes-caixa-por-dia (achado real, pedido explícito do usuário) —
      // devolvido mesmo havendo sessão aberta (não só no branch `session: null`), senão o
      // seletor "Caixa para conferência" (web) perde as sessões fechadas de hoje assim que uma
      // nova sessão é aberta.
      todayClosedSessions: [],
      movements: [expect.objectContaining({ id: 'mv-1' })],
      calculatedBalance: 150,
      tableSales: 75,
      deliverySales: 40,
      balanceByPaymentMethod: { pix: 100, cash: 30 },
    });
    expect(orderRepository.getTableSalesBetween).toHaveBeenCalledWith('r-1', new Date('2026-09-09T08:00:00.000Z'), expect.any(Date));
    expect(orderRepository.getDeliverySalesBetween).toHaveBeenCalledWith('r-1', new Date('2026-09-09T08:00:00.000Z'), expect.any(Date));
    expect(cashRegisterService.getBalanceByPaymentMethod).toHaveBeenCalledWith('cr-1');
  });

  // specs/0219-multiplas-sessoes-caixa-por-dia (achado real, pedido explícito do usuário) — tinha
  // ficado só dentro do `if (!session)`: com uma sessão aberta hoje (ex. caixa do turno da
  // tarde) e uma sessão já fechada hoje mais cedo (ex. turno da manhã), a fechada sumia do
  // combobox assim que o turno da tarde era aberto.
  it('specs/0219: GET /restaurants/me/cash-register/open inclui todayClosedSessions mesmo com uma sessão aberta', async () => {
    const closedMorning = buildSession({ id: 'cr-manha', status: 'fechado' });
    const { routes } = setup({
      cashRegisterRepository: {
        findOpenSessionByRestaurant: jest.fn().mockResolvedValue(buildSession({ id: 'cr-tarde' })),
        findClosedSessionsForDate: jest.fn().mockResolvedValue([closedMorning]),
      },
    });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/cash-register/open'], { restaurantId: 'r-1' }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ todayClosedSessions: [expect.objectContaining(closedMorning)] }));
  });

  // specs/0219-multiplas-sessoes-caixa-por-dia (achado real, pedido explícito do usuário) —
  // `findPendingSessions` (qualquer sessão aberta, qualquer data) incluía a própria sessão de
  // hoje quando ela existia, fazendo o seletor "Caixa para conferência" (web) mostrar a MESMA
  // sessão duas vezes ("Caixa aberto Atual" e "Pendente de fechamento"). `pendingSessions`
  // devolvido ao front nunca deve conter a sessão que já é `session`.
  it('specs/0219: GET /restaurants/me/cash-register/open não duplica a sessão de hoje em pendingSessions', async () => {
    const todaySession = buildSession({ id: 'cr-hoje' });
    const { routes } = setup({
      cashRegisterRepository: {
        findOpenSessionByRestaurant: jest.fn().mockResolvedValue(todaySession),
        findPendingSessions: jest.fn().mockResolvedValue([todaySession]),
      },
    });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/cash-register/open'], { restaurantId: 'r-1' }, { json });

    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ pendingSessions: [] }));
  });

  it('AC-4: POST /restaurants/me/cash-register/open abre uma sessão com o valor inicial informado', async () => {
    const { cashRegisterRepository, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/cash-register/open'],
      { restaurantId: 'r-1', user: { uid: 'operator-1' }, operatorId: 'operator-1', body: { openingBalance: 100 } },
      { json },
    );

    expect(cashRegisterRepository.open).toHaveBeenCalledWith('r-1', 100, 'operator-1');
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ status: 'aberto' }));
  });

  // specs/0220-operador-no-fechamento-caixa REQ-1/AC-1 — grava o id do `RestaurantOperator`
  // (`req.operatorId`), não mais o UID do Firebase (`req.user.uid`) — valores DIFERENTES aqui de
  // propósito, pra pegar regressão se alguém trocar de volta pra `req.user.uid`.
  it('specs/0220: POST .../open grava req.operatorId (id do RestaurantOperator), não o UID do Firebase', async () => {
    const { cashRegisterRepository, routes } = setup();

    await runOperatorChain(
      routes['POST /restaurants/me/cash-register/open'],
      { restaurantId: 'r-1', user: { uid: 'firebase-uid-xyz' }, operatorId: 'operator-real-id', body: { openingBalance: 0 } },
      { json: jest.fn() },
    );

    expect(cashRegisterRepository.open).toHaveBeenCalledWith('r-1', 0, 'operator-real-id');
  });

  // specs/0219-multiplas-sessoes-caixa-por-dia — deixou de checar "existe sessão desta data" no
  // controller (bloqueava abrir de novo no mesmo dia depois de um fechamento); quem bloqueia
  // agora é `cashRegisterRepository.open()` (via `findPendingSessions`/índice único), não mais
  // uma checagem redundante aqui.
  it('AC-8: POST /restaurants/me/cash-register/open bloqueia e indica a sessão já aberta', async () => {
    const { cashRegisterRepository, routes } = setup({
      cashRegisterRepository: {
        open: jest.fn().mockRejectedValue(new ConflictError('Existe um caixa aberto (id cr-1) desde 2026-09-09 — feche-o antes de abrir um novo.')),
      },
    });

    await expect(
      runOperatorChain(
        routes['POST /restaurants/me/cash-register/open'],
        { restaurantId: 'r-1', user: { uid: 'operator-1' }, operatorId: 'operator-1', body: { openingBalance: 100 } },
        { json: jest.fn() },
      ),
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('cr-1') });
    expect(cashRegisterRepository.open).toHaveBeenCalledWith('r-1', 100, 'operator-1');
  });

  // Achado real (23/11/2026) — restaurante com `cashRegisterMode: 'automatic'`: o
  // `ensureAutomaticSchedule` chamado logo antes já abre a sessão de hoje dentro da MESMA
  // requisição, fazendo o `open()` manual seguinte bater no índice único e lançar um
  // `ConflictError` genérico (sem id/data, diferente do erro de sessão presa do AC-8 acima). Como
  // há uma sessão aberta HOJE (`findOpenSessionByRestaurant`), o endpoint devolve essa sessão como
  // sucesso em vez de propagar o erro — o usuário só queria abrir o caixa, e ele já está aberto.
  it('23/11: POST .../open não propaga o ConflictError de corrida quando ensureAutomaticSchedule já abriu a sessão de hoje', async () => {
    const openedAutomatically = buildSession({ id: 'cr-auto', openedBy: 'automatico', openedAutomatically: true });
    const { cashRegisterRepository, routes } = setup({
      cashRegisterRepository: {
        open: jest.fn().mockRejectedValue(new ConflictError('Já existe um caixa aberto para este restaurante')),
        findOpenSessionByRestaurant: jest.fn().mockResolvedValue(openedAutomatically),
      },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/cash-register/open'],
      { restaurantId: 'r-1', user: { uid: 'operator-1' }, operatorId: 'operator-1', body: { openingBalance: 0 } },
      { json },
    );

    expect(cashRegisterRepository.open).toHaveBeenCalledWith('r-1', 0, 'operator-1');
    expect(json).toHaveBeenCalledWith(200, openedAutomatically);
  });

  // specs/0219-multiplas-sessoes-caixa-por-dia AC-1 — fechar o caixa de hoje não bloqueia mais
  // abrir um novo em seguida (turnos/troca de operador): sem sessão aberta, `open()` é chamado
  // normalmente mesmo havendo sessões fechadas hoje.
  it('specs/0219: POST /restaurants/me/cash-register/open abre uma nova sessão mesmo com uma já fechada hoje', async () => {
    const { cashRegisterRepository, routes } = setup({
      cashRegisterRepository: { findClosedSessionsForDate: jest.fn().mockResolvedValue([buildSession({ id: 'cr-manha', status: 'fechado' })]) },
    });
    const json = jest.fn();

    await runOperatorChain(
      routes['POST /restaurants/me/cash-register/open'],
      { restaurantId: 'r-1', user: { uid: 'operator-1' }, operatorId: 'operator-1', body: { openingBalance: 100 } },
      { json },
    );

    expect(cashRegisterRepository.open).toHaveBeenCalledWith('r-1', 100, 'operator-1');
    expect(json).toHaveBeenCalledWith(201, expect.objectContaining({ status: 'aberto' }));
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
      { restaurantId: 'r-1', user: { uid: 'operator-1' }, operatorId: 'operator-1', params: { id: 'cr-1' }, body: { countedValue: 140 } },
      { json },
    );

    expect(cashRegisterRepository.close).toHaveBeenCalledWith('cr-1', 140, 'operator-1');
    expect(json).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ calculatedBalance: 150, difference: -10, tableSales: 75, deliverySales: 40, session: expect.objectContaining({ status: 'fechado' }) }),
    );
    expect(orderRepository.getTableSalesBetween).toHaveBeenCalledWith('r-1', new Date('2026-09-09T08:00:00.000Z'), expect.any(Date));
    expect(orderRepository.getDeliverySalesBetween).toHaveBeenCalledWith('r-1', new Date('2026-09-09T08:00:00.000Z'), expect.any(Date));
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

  // Ajuste explícito do usuário (02/11/2026) — só o dono pode reabrir um caixa já fechado.
  // `runOperatorChain` (slice(3)) passa por `requireOwnerRole()` de verdade aqui (diferente das
  // outras rotas acima, só `requireOperatorRole` é pulado) — por isso os testes setam
  // `req.operatorRole` explicitamente, no mesmo padrão de `restaurant-operators.controller.spec.ts`.
  describe('POST /restaurants/me/cash-register/:id/reopen', () => {
    it('dono consegue reabrir um caixa fechado', async () => {
      const { cashRegisterRepository, routes } = setup({
        cashRegisterRepository: {
          findById: jest.fn().mockResolvedValue(buildSession({ status: 'fechado', closingBalance: 150 })),
          reopen: jest.fn().mockResolvedValue(buildSession({ status: 'aberto', reopenedBy: 'dono-1' })),
        },
      });
      const json = jest.fn();

      await runOperatorChain(
        routes['POST /restaurants/me/cash-register/:id/reopen'],
        { restaurantId: 'r-1', operatorRole: 'dono', user: { uid: 'dono-1' }, operatorId: 'dono-1', params: { id: 'cr-1' } },
        { json },
      );

      expect(cashRegisterRepository.reopen).toHaveBeenCalledWith('cr-1', 'dono-1');
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ status: 'aberto', reopenedBy: 'dono-1' }));
    });

    it('gerente/financeiro não conseguem reabrir (403, só dono)', async () => {
      const { cashRegisterRepository, routes } = setup({
        cashRegisterRepository: { findById: jest.fn().mockResolvedValue(buildSession({ status: 'fechado' })) },
      });

      await expect(
        runOperatorChain(
          routes['POST /restaurants/me/cash-register/:id/reopen'],
          { restaurantId: 'r-1', operatorRole: 'gerente', params: { id: 'cr-1' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(cashRegisterRepository.reopen).not.toHaveBeenCalled();
    });

    it('recusa reabrir uma sessão que não está fechada', async () => {
      const { cashRegisterRepository, routes } = setup({
        cashRegisterRepository: { findById: jest.fn().mockResolvedValue(buildSession({ status: 'aberto' })) },
      });

      await expect(
        runOperatorChain(
          routes['POST /restaurants/me/cash-register/:id/reopen'],
          { restaurantId: 'r-1', operatorRole: 'dono', params: { id: 'cr-1' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(cashRegisterRepository.reopen).not.toHaveBeenCalled();
    });

    it('recusa reabrir enquanto já existe outro caixa aberto (nunca dois caixas abertos ao mesmo tempo)', async () => {
      const { cashRegisterRepository, routes } = setup({
        cashRegisterRepository: {
          findById: jest.fn().mockResolvedValue(buildSession({ status: 'fechado' })),
          findPendingSessions: jest.fn().mockResolvedValue([buildSession({ id: 'cr-2', businessDate: '2026-09-10', status: 'aberto' })]),
        },
      });

      await expect(
        runOperatorChain(
          routes['POST /restaurants/me/cash-register/:id/reopen'],
          { restaurantId: 'r-1', operatorRole: 'dono', params: { id: 'cr-1' } },
          { json: jest.fn() },
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(cashRegisterRepository.reopen).not.toHaveBeenCalled();
    });
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
        tableSales: 0,
        deliverySales: 100,
        lateMovements: [],
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
      // specs/0220-operador-no-fechamento-caixa — cada `closing.session` ganha
      // `openedByName`/`closedByName`/`reopenedByName` resolvidos; `objectContaining` por sessão
      // em vez de igualdade exata, já que esse não é o foco deste teste (REQ-10/AC-7).
      const expectedSummary = (id: string) => ({ ...summaryFor(id), session: expect.objectContaining(summaryFor(id).session) });
      expect(json).toHaveBeenCalledWith(200, {
        from,
        to,
        closings: [expectedSummary('cr-1'), expectedSummary('cr-2'), expectedSummary('cr-3')],
      });
    });

    // specs/0220-operador-no-fechamento-caixa REQ-2/REQ-3/AC-2 — resolve `closedBy` (id do
    // operador) pra nome, em lote, via `findManyByIds`.
    it('specs/0220: resolve o nome de quem fechou cada sessão do histórico', async () => {
      const from = '2026-10-01T00:00:00.000Z';
      const to = '2026-10-31T23:59:59.000Z';
      const closedSessions = [buildSession({ id: 'cr-1', status: 'fechado', closedBy: 'op-maria' })];
      const { routes } = setup({
        cashRegisterRepository: { findClosedSessionsBetween: jest.fn().mockResolvedValue(closedSessions) },
        cashRegisterService: {
          getClosingSummary: jest.fn().mockResolvedValue({
            session: closedSessions[0], balanceByPaymentMethod: {}, totalSales: 0, calculatedBalance: 0,
            difference: 0, tableSales: 0, deliverySales: 0, lateMovements: [],
          }),
        },
        restaurantOperatorRepository: {
          findManyByIds: jest.fn().mockResolvedValue([{ id: 'op-maria', name: 'Maria', email: 'maria@x.com', restaurantId: 'r-1', role: 'gerente', isActive: true, createdAt: new Date() }]),
        },
      });
      const json = jest.fn();

      await runOperatorChain(routes['GET /restaurants/me/cash-register/history'], { restaurantId: 'r-1', query: { from, to } }, { json });

      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
        closings: [expect.objectContaining({ session: expect.objectContaining({ closedByName: 'Maria' }) })],
      }));
    });

    // AC-4 — fechamento automático (worker) nunca deve tentar resolver 'automatico' como se
    // fosse um id de operador real; rotulado direto, sem bater no repositório.
    it('specs/0220 AC-4: fechamento automático mostra "Automático", não tenta resolver operador', async () => {
      const from = '2026-10-01T00:00:00.000Z';
      const to = '2026-10-31T23:59:59.000Z';
      const closedSessions = [buildSession({ id: 'cr-1', status: 'fechado', closedBy: 'automatico', closedAutomatically: true })];
      const findManyByIds = jest.fn().mockResolvedValue([]);
      const { routes } = setup({
        cashRegisterRepository: { findClosedSessionsBetween: jest.fn().mockResolvedValue(closedSessions) },
        cashRegisterService: {
          getClosingSummary: jest.fn().mockResolvedValue({
            session: closedSessions[0], balanceByPaymentMethod: {}, totalSales: 0, calculatedBalance: 0,
            difference: 0, tableSales: 0, deliverySales: 0, lateMovements: [],
          }),
        },
        restaurantOperatorRepository: { findManyByIds },
      });
      const json = jest.fn();

      await runOperatorChain(routes['GET /restaurants/me/cash-register/history'], { restaurantId: 'r-1', query: { from, to } }, { json });

      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
        closings: [expect.objectContaining({ session: expect.objectContaining({ closedByName: 'Automático' }) })],
      }));
      expect(findManyByIds).not.toHaveBeenCalledWith(expect.arrayContaining(['automatico']));
    });

    // AC-3 — sessão fechada ANTES desta spec (UID do Firebase, não um id de operador válido)
    // nunca quebra a página; resolve pra `null`.
    it('specs/0220 AC-3: closedBy legado (UID do Firebase, sem operador correspondente) resolve pra null', async () => {
      const from = '2026-10-01T00:00:00.000Z';
      const to = '2026-10-31T23:59:59.000Z';
      const closedSessions = [buildSession({ id: 'cr-1', status: 'fechado', closedBy: 'firebase-uid-antigo' })];
      const { routes } = setup({
        cashRegisterRepository: { findClosedSessionsBetween: jest.fn().mockResolvedValue(closedSessions) },
        cashRegisterService: {
          getClosingSummary: jest.fn().mockResolvedValue({
            session: closedSessions[0], balanceByPaymentMethod: {}, totalSales: 0, calculatedBalance: 0,
            difference: 0, tableSales: 0, deliverySales: 0, lateMovements: [],
          }),
        },
        restaurantOperatorRepository: { findManyByIds: jest.fn().mockResolvedValue([]) },
      });
      const json = jest.fn();

      await runOperatorChain(routes['GET /restaurants/me/cash-register/history'], { restaurantId: 'r-1', query: { from, to } }, { json });

      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
        closings: [expect.objectContaining({ session: expect.objectContaining({ closedByName: null }) })],
      }));
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

  describe('GET /restaurants/me/cash-register/movements', () => {
    // (ajuste, pedido explícito do usuário) — era só manuais; agora inclui também as vendas
    // automáticas (com `orderId`) no período.
    it('devolve todos os movimentos do período, manuais e automáticos (com orderId)', async () => {
      const from = '2026-10-01T00:00:00.000Z';
      const to = '2026-10-31T23:59:59.000Z';
      const movements = [
        buildMovement({ id: 'mv-entrada', type: 'entrada', description: 'Suprimento' }),
        buildMovement({ id: 'mv-saida', type: 'saida', description: 'Sangria' }),
        buildMovement({ id: 'mv-venda', type: 'entrada', description: 'Mesa/balcão #8', orderId: 'order-1' }),
      ];
      const { cashRegisterRepository, routes } = setup({
        cashRegisterRepository: { findMovementsByRestaurantBetween: jest.fn().mockResolvedValue(movements) },
      });
      const json = jest.fn();

      await runOperatorChain(routes['GET /restaurants/me/cash-register/movements'], { restaurantId: 'r-1', query: { from, to } }, { json });

      expect(cashRegisterRepository.findMovementsByRestaurantBetween).toHaveBeenCalledWith('r-1', new Date(from), new Date(to));
      expect(json).toHaveBeenCalledWith(200, { from, to, movements });
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
