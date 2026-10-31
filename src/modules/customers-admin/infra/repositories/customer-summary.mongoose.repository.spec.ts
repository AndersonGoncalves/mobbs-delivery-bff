import { OrderModel } from '../../../orders/infra/models/order.mongoose.model';
import { CustomerSummaryMongooseRepository } from './customer-summary.mongoose.repository';

// Achado de auditoria pré-produção (31/10/2026) — "customers-summary sem paginação, agrega o
// histórico inteiro": `listByRestaurantPage` é um método NOVO, separado de `listByRestaurant`
// (sem teste dedicado aqui — comportamento inalterado), que pagina de verdade no servidor.
describe('CustomerSummaryMongooseRepository.listByRestaurantPage (achado de auditoria 2026-10-31)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('pagina no servidor via $facet (skip/limit) e devolve o total real, não o total da página', async () => {
    const aggregateSpy = jest.spyOn(OrderModel, 'aggregate').mockResolvedValue([
      {
        items: [
          { customerId: 'c-1', name: 'Maria', phone: '5511999990000', totalOrders: 3, totalSpent: 150.5, lastOrderAt: new Date('2026-09-01T12:00:00.000Z'), allowedPaymentMethods: undefined },
        ],
        totalCount: [{ count: 137 }],
      },
    ] as never);
    const repository = new CustomerSummaryMongooseRepository();

    const result = await repository.listByRestaurantPage('r-1', { skip: 25, limit: 25 });

    expect(aggregateSpy).toHaveBeenCalledTimes(1);
    const pipeline = aggregateSpy.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
    expect(pipeline[0]).toEqual({ $match: { restaurantId: 'r-1' } });
    const facetStage = pipeline.find((stage) => '$facet' in stage) as { $facet: { items: unknown[] } };
    expect(facetStage.$facet.items).toEqual([{ $skip: 25 }, { $limit: 25 }]);
    expect(result.total).toBe(137);
    expect(result.items).toEqual([
      { customerId: 'c-1', name: 'Maria', phone: '5511999990000', totalOrders: 3, totalSpent: 150.5, lastOrderAt: '2026-09-01T12:00:00.000Z', allowedPaymentMethods: undefined },
    ]);
  });

  it('sem nenhum resultado (restaurante sem clientes), devolve lista vazia e total 0', async () => {
    jest.spyOn(OrderModel, 'aggregate').mockResolvedValue([] as never);
    const repository = new CustomerSummaryMongooseRepository();

    const result = await repository.listByRestaurantPage('r-1', { skip: 0, limit: 25 });

    expect(result).toEqual({ items: [], total: 0 });
  });

  it('repassa o filtro de busca (nome/telefone) pro $match do pipeline combinado', async () => {
    const aggregateSpy = jest.spyOn(OrderModel, 'aggregate').mockResolvedValue([{ items: [], totalCount: [] }] as never);
    const repository = new CustomerSummaryMongooseRepository();

    await repository.listByRestaurantPage('r-1', { skip: 0, limit: 25 }, 'Maria');

    const pipeline = aggregateSpy.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
    const searchStage = pipeline.find((stage) => {
      const match = (stage as { $match?: { $or?: unknown } }).$match;
      return !!match?.$or;
    }) as { $match: { $or: Array<{ name?: RegExp; phone?: RegExp }> } };
    expect(searchStage.$match.$or[0].name?.source).toBe('Maria');
  });

  it('une a fonte de pedidos com a de clientes cadastrados manualmente (createdByRestaurantId) via $unionWith', async () => {
    const aggregateSpy = jest.spyOn(OrderModel, 'aggregate').mockResolvedValue([{ items: [], totalCount: [] }] as never);
    const repository = new CustomerSummaryMongooseRepository();

    await repository.listByRestaurantPage('r-1', { skip: 0, limit: 25 });

    const pipeline = aggregateSpy.mock.calls[0][0] as unknown as Array<Record<string, unknown>>;
    const unionStage = pipeline.find((stage) => '$unionWith' in stage) as {
      $unionWith: { coll: string; pipeline: Array<{ $match?: { createdByRestaurantId?: string } }> };
    };
    expect(unionStage.$unionWith.coll).toBe('customer');
    expect(unionStage.$unionWith.pipeline[0].$match).toEqual({ createdByRestaurantId: 'r-1' });
  });
});
