import { OrderModel } from '../models/order.mongoose.model';
import { OrderMongooseRepository } from './order.mongoose.repository';

// specs/0164-impressao-automatica-so-confirmado — mock do Model (não integração real de Mongo),
// mesmo padrão-exceção de presence.mongoose.repository.spec.ts: normalmente nenhum
// *.mongoose.repository.ts tem spec próprio (só os controllers, via repositório mockado), mas
// aqui é a própria query do gatilho de impressão que precisa ser validada — não dá pra confiar
// só no mock de `IOrderRepository` usado pelos specs de controller.
jest.mock('../models/order.mongoose.model', () => ({
  OrderModel: { find: jest.fn() },
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
      orderType: { $in: ['delivery', 'pickup'] },
      status: { $ne: 'cancelado' },
      autoPrintStatus: { $ne: 'printed' },
      statusHistory: { $elemMatch: { status: 'confirmado', changedAt: { $gte: new Date(NOW.getTime() - 5 * 60_000) } } },
    });
    expect(sort).toHaveBeenCalledWith({ createdAt: 1 });
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
    expect(filter.statusHistory.$elemMatch.changedAt).toEqual({ $gte: new Date(NOW.getTime() - 30 * 60_000) });
    expect(filter.createdAt).toBeUndefined();
  });
});
