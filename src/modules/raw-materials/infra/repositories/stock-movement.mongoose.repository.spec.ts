import { StockMovementModel } from '../models/stock-movement.mongoose.model';
import { StockMovementMongooseRepository } from './stock-movement.mongoose.repository';

// Achado de auditoria pré-produção (31/10/2026) — "listas sem paginação em financeiro, clientes
// e estoque".
describe('StockMovementMongooseRepository — métodos paginados (achado de auditoria 2026-10-31)', () => {
  afterEach(() => jest.restoreAllMocks());

  function mockFindChain(docs: unknown[]) {
    const leanMock = jest.fn().mockResolvedValue(docs);
    const limitMock = jest.fn().mockReturnValue({ lean: leanMock });
    const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
    const sortMock = jest.fn().mockReturnValue({ skip: skipMock });
    jest.spyOn(StockMovementModel, 'find').mockReturnValue({ sort: sortMock } as never);
    return { sortMock, skipMock, limitMock };
  }

  it('listByRawMaterialPage pagina no servidor e devolve o total real, não o total da página', async () => {
    const { sortMock, skipMock, limitMock } = mockFindChain([{ _id: 'mv-2', restaurantId: 'r-1', rawMaterialId: 'rm-1', type: 'saida', quantity: 2, createdAt: new Date() }]);
    jest.spyOn(StockMovementModel, 'countDocuments').mockResolvedValue(40 as never);
    const repository = new StockMovementMongooseRepository();

    const result = await repository.listByRawMaterialPage('rm-1', { skip: 20, limit: 20 });

    expect(sortMock).toHaveBeenCalledWith({ createdAt: 1 });
    expect(skipMock).toHaveBeenCalledWith(20);
    expect(limitMock).toHaveBeenCalledWith(20);
    expect(result.total).toBe(40);
    expect(result.items.map((m) => m.id)).toEqual(['mv-2']);
  });

  it('listByProductPage pagina no servidor e devolve o total real, não o total da página', async () => {
    mockFindChain([{ _id: 'mv-3', restaurantId: 'r-1', productId: 'p-1', type: 'entrada', quantity: 5, createdAt: new Date() }]);
    jest.spyOn(StockMovementModel, 'countDocuments').mockResolvedValue(12 as never);
    const repository = new StockMovementMongooseRepository();

    const result = await repository.listByProductPage('p-1', { skip: 0, limit: 25 });

    expect(result.total).toBe(12);
    expect(result.items.map((m) => m.id)).toEqual(['mv-3']);
  });
});
