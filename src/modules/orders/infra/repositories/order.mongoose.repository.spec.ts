import { OrderModel } from '../models/order.mongoose.model';
import { OrderMongooseRepository } from './order.mongoose.repository';

// specs/0143-correcao-gatilho-impressao-automatica — mock do Model (não integração real de
// Mongo), mesmo padrão-exceção de presence.mongoose.repository.spec.ts: normalmente nenhum
// *.mongoose.repository.ts tem spec próprio (só os controllers, via repositório mockado), mas
// aqui é a própria consulta de agregação (pipeline com `$lookup` em `payment`) que precisa ser
// validada — não dá pra confiar só no mock de `IOrderRepository` usado pelos specs de controller.
jest.mock('../models/order.mongoose.model', () => ({
  OrderModel: { aggregate: jest.fn() },
}));

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
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('AC-1/AC-2/AC-3: pipeline exclui cancelado/já impresso e só exige Payment aprovado pra Pix', async () => {
    (OrderModel.aggregate as jest.Mock).mockResolvedValue([]);
    const repository = new OrderMongooseRepository();

    await repository.findPendingAutoPrint('r-1');

    expect(OrderModel.aggregate).toHaveBeenCalledWith([
      {
        $match: {
          restaurantId: 'r-1',
          orderType: { $in: ['delivery', 'pickup'] },
          status: { $ne: 'cancelado' },
          autoPrintStatus: { $ne: 'printed' },
        },
      },
      { $lookup: { from: 'payment', localField: '_id', foreignField: 'orderId', as: 'payment' } },
      { $match: { $or: [{ paymentMethod: { $ne: 'pix' } }, { 'payment.status': 'aprovado' }] } },
      { $sort: { createdAt: 1 } },
    ]);
  });

  it('AC-1: mapeia um pedido ainda não confirmado (aguardandoConfirmacao) normalmente', async () => {
    (OrderModel.aggregate as jest.Mock).mockResolvedValue([buildDoc({ status: 'aguardandoConfirmacao' })]);
    const repository = new OrderMongooseRepository();

    const orders = await repository.findPendingAutoPrint('r-1');

    expect(orders).toHaveLength(1);
    expect(orders[0].status).toBe('aguardandoConfirmacao');
    expect(orders[0].id).toBe('order-1');
  });
});
