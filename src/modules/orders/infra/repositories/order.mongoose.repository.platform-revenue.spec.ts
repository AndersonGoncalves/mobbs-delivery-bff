import { OrderModel } from '../models/order.mongoose.model';
import { OrderMongooseRepository } from './order.mongoose.repository';

// Achado crítico de auditoria pré-produção (31/10/2026) — "painel da plataforma: 1 query
// completa por restaurante + soma em JS": spec próprio (não só via mock de `IOrderRepository`
// nos specs de controller) porque é a própria agregação que precisa ser validada — mesmo
// motivo de `customer-summary.mongoose.repository.spec.ts`. Usa `jest.spyOn` direto no
// `OrderModel` real (sem `jest.mock` do módulo inteiro) pra poder espiar `aggregate`.
describe('OrderMongooseRepository — agregações em lote pro painel da plataforma (achado de auditoria 2026-10-31)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('getMonthlyRevenueCentsByRestaurant agrega TODOS os restaurantes num só round-trip, arredondando por pedido antes de somar', async () => {
    const aggregateSpy = jest.spyOn(OrderModel, 'aggregate').mockResolvedValue([
      { _id: 'r-1', revenueCents: 220000 },
      { _id: 'r-2', revenueCents: 0 },
    ] as never);
    const repository = new OrderMongooseRepository();
    const start = new Date('2026-10-01T03:00:00.000Z');
    const end = new Date('2026-11-01T03:00:00.000Z');

    const result = await repository.getMonthlyRevenueCentsByRestaurant(start, end);

    expect(aggregateSpy).toHaveBeenCalledTimes(1);
    const pipeline = aggregateSpy.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
    expect(pipeline[0]).toEqual({ $match: { status: 'entregue', createdAt: { $gte: start, $lt: end } } });
    const groupStage = pipeline[1] as { $group: { revenueCents: { $sum: unknown } } };
    expect(groupStage.$group.revenueCents.$sum).toEqual({ $round: [{ $multiply: ['$total', 100] }, 0] });
    expect(result.get('r-1')).toBe(220000);
    expect(result.get('r-2')).toBe(0);
    expect(result.has('r-3')).toBe(false);
  });

  it('getLastDeliveredAtByRestaurant agrega o último pedido entregue de TODOS os restaurantes num só round-trip', async () => {
    const lastDelivered = new Date('2026-10-02T12:00:00.000Z');
    const aggregateSpy = jest.spyOn(OrderModel, 'aggregate').mockResolvedValue([{ _id: 'r-1', lastDeliveredAt: lastDelivered }] as never);
    const repository = new OrderMongooseRepository();

    const result = await repository.getLastDeliveredAtByRestaurant();

    expect(aggregateSpy).toHaveBeenCalledTimes(1);
    const pipeline = aggregateSpy.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
    expect(pipeline[0]).toEqual({ $match: { status: 'entregue' } });
    expect(result.get('r-1')).toEqual(lastDelivered);
    expect(result.has('r-2')).toBe(false);
  });
});
