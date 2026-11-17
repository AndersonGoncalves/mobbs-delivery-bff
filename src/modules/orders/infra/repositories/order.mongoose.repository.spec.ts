import { OrderModel } from '../models/order.mongoose.model';
import { OrderMongooseRepository } from './order.mongoose.repository';

// specs/0164-impressao-automatica-so-confirmado — mock do Model (não integração real de Mongo),
// mesmo padrão-exceção de presence.mongoose.repository.spec.ts: normalmente nenhum
// *.mongoose.repository.ts tem spec próprio (só os controllers, via repositório mockado), mas
// aqui é a própria query do gatilho de impressão que precisa ser validada — não dá pra confiar
// só no mock de `IOrderRepository` usado pelos specs de controller.
jest.mock('../models/order.mongoose.model', () => ({
  OrderModel: { find: jest.fn(), distinct: jest.fn() },
}));

function mockFindResult(docs: unknown[]) {
  const lean = jest.fn().mockResolvedValue(docs);
  const sort = jest.fn().mockReturnValue({ lean });
  (OrderModel.find as jest.Mock).mockReturnValue({ sort });
  return { sort, lean };
}

function buildDoc(overrides: Record<string, unknown> = {}) {
  return {
    _id: 'order-1',
    orderNumber: 1,
    trackingToken: 'token',
    customerId: 'customer-1',
    restaurantId: 'r-1',
    items: [],
    orderType: 'delivery',
    status: 'aguardandoConfirmacao',
    statusHistory: [],
    subtotal: 10,
    deliveryFee: 5,
    discount: 0,
    total: 15,
    paymentMethod: 'cash',
    createdAt: new Date('2026-10-14T12:00:00.000Z'),
    ...overrides,
  };
}

describe('OrderMongooseRepository.findPendingAutoPrint', () => {
  const NOW = new Date('2026-10-15T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('specs/0164 AC-1/AC-2/AC-3: só pedido com `confirmado` no histórico, não cancelado e ainda não impresso', async () => {
    const { sort } = mockFindResult([]);
    const repository = new OrderMongooseRepository();

    await repository.findPendingAutoPrint('r-1', 5);

    expect(OrderModel.find).toHaveBeenCalledWith({
      restaurantId: 'r-1',
      autoPrintStatus: { $ne: 'printed' },
      $or: [
        {
          orderType: { $in: ['delivery', 'pickup'] },
          status: { $ne: 'cancelado' },
          statusHistory: { $elemMatch: { status: 'confirmado', changedAt: { $gte: new Date(NOW.getTime() - 5 * 60_000) } } },
        },
        {
          orderType: 'table',
          status: 'entregue',
          tableClosedAt: { $gte: new Date(NOW.getTime() - 5 * 60_000).toISOString() },
        },
      ],
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: 1 });
  });

  // Pedido explícito do usuário (17/11/2026) — mesa/balcão entra na mesma fila, mas com a janela
  // de idade contada a partir de `tableClosedAt` (fechamento), não de `confirmado` — mesa nunca
  // passa por esse status e fica aberta por horas.
  it('mesa/balcão: filtra por status "entregue" e tableClosedAt, janela de idade própria', async () => {
    mockFindResult([]);
    const repository = new OrderMongooseRepository();

    await repository.findPendingAutoPrint('r-1', 60);

    const [[filter]] = (OrderModel.find as jest.Mock).mock.calls;
    const tableClause = filter.$or.find((clause: { orderType: string }) => clause.orderType === 'table');

    expect(tableClause).toEqual({
      orderType: 'table',
      status: 'entregue',
      tableClosedAt: { $gte: new Date(NOW.getTime() - 60 * 60_000).toISOString() },
    });
  });

  it('mapeia um pedido de mesa fechado (status "entregue")', async () => {
    mockFindResult([buildDoc({ orderType: 'table', status: 'entregue', tableClosedAt: NOW.toISOString() })]);
    const repository = new OrderMongooseRepository();

    const orders = await repository.findPendingAutoPrint('r-1', 60);

    expect(orders).toHaveLength(1);
    expect(orders[0].orderType).toBe('table');
    expect(orders[0].status).toBe('entregue');
  });

  it('specs/0164 AC-1: mapeia um pedido já confirmado normalmente', async () => {
    mockFindResult([buildDoc({ status: 'confirmado' })]);
    const repository = new OrderMongooseRepository();

    const orders = await repository.findPendingAutoPrint('r-1', 5);

    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe('confirmado');
    expect(orders[0].id).toBe('order-1');
  });

  // specs/0156-filtro-idade-impressao-automatica REQ-1.
  it('specs/0156 + 0164 REQ-3: calcula o corte (cutoff) a partir de maxAgeMinutes, contado desde a confirmação', async () => {
    mockFindResult([]);
    const repository = new OrderMongooseRepository();

    await repository.findPendingAutoPrint('r-1', 30);

    const [[filter]] = (OrderModel.find as jest.Mock).mock.calls;
    const deliveryClause = filter.$or.find((clause: { orderType: unknown }) => clause.orderType && typeof clause.orderType === 'object');
    expect(deliveryClause.statusHistory.$elemMatch.changedAt).toEqual({ $gte: new Date(NOW.getTime() - 30 * 60_000) });
    expect(filter.createdAt).toBeUndefined();
  });
});

// Pedido explícito do usuário (16/11/2026), achado da revisão: mesma janela de idade de
// `findPendingAutoPrint` acima, agora pro cupom fiscal — sem ela, a bridge reconectando depois de
// ficar offline imprimiria todas as notas represadas de uma vez.
describe('OrderMongooseRepository.findPendingFiscalPrint', () => {
  const NOW = new Date('2026-11-16T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('calcula o corte (cutoff) a partir de maxAgeMinutes, contado desde fiscal.emittedAt', async () => {
    const { sort } = mockFindResult([]);
    const repository = new OrderMongooseRepository();

    await repository.findPendingFiscalPrint('r-1', 5);

    expect(OrderModel.find).toHaveBeenCalledWith({
      restaurantId: 'r-1',
      'fiscal.status': 'emitido',
      'fiscal.emittedAt': { $gte: new Date(NOW.getTime() - 5 * 60_000).toISOString() },
      fiscalPrintStatus: { $ne: 'printed' },
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: 1 });
  });

  it('mapeia um pedido com nota emitida pendente de impressão', async () => {
    mockFindResult([buildDoc({ status: 'saiuParaEntrega', fiscal: { status: 'emitido', ref: 'order-1' } })]);
    const repository = new OrderMongooseRepository();

    const orders = await repository.findPendingFiscalPrint('r-1', 5);

    expect(orders).toHaveLength(1);
    expect(orders[0].fiscal?.status).toBe('emitido');
  });

  it('respeita maxAgeMinutes configurado, diferente do default', async () => {
    mockFindResult([]);
    const repository = new OrderMongooseRepository();

    await repository.findPendingFiscalPrint('r-1', 20);

    const [[filter]] = (OrderModel.find as jest.Mock).mock.calls;
    expect(filter['fiscal.emittedAt']).toEqual({ $gte: new Date(NOW.getTime() - 20 * 60_000).toISOString() });
  });
});

// specs/0198-rastreamento-motoboy-tempo-real REQ-3.
describe('OrderMongooseRepository.findDistinctMotoboyIdsByStatus', () => {
  afterEach(() => jest.restoreAllMocks());

  it('consulta distinct por restaurantId/status, excluindo deliveryMotoboy.id nulo', async () => {
    (OrderModel.distinct as jest.Mock).mockResolvedValue(['m-1', 'm-2']);

    const result = await new OrderMongooseRepository().findDistinctMotoboyIdsByStatus('r-1', 'saiuParaEntrega');

    expect(OrderModel.distinct).toHaveBeenCalledWith('deliveryMotoboy.id', {
      restaurantId: 'r-1',
      status: 'saiuParaEntrega',
      'deliveryMotoboy.id': { $ne: null },
    });
    expect(result).toEqual(['m-1', 'm-2']);
  });
});
