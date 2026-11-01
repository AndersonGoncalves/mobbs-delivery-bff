import { AccountReceivableModel } from '../models/account-receivable.mongoose.model';
import { AccountReceivableMongooseRepository } from './account-receivable.mongoose.repository';

// Achado de auditoria pré-produção (31/10/2026) — "listas sem paginação em financeiro, clientes
// e estoque".
describe('AccountReceivableMongooseRepository.listByRestaurantPage (achado de auditoria 2026-10-31)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('pagina no servidor (sort/skip/limit) e devolve o total real, não o total da página', async () => {
    const leanMock = jest.fn().mockResolvedValue([{ _id: 'ar-2', restaurantId: 'r-1', description: 'Fiado', issueDate: new Date(), dueDate: new Date(), value: 120, status: 'aberto' }]);
    const limitMock = jest.fn().mockReturnValue({ lean: leanMock });
    const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
    const sortMock = jest.fn().mockReturnValue({ skip: skipMock });
    jest.spyOn(AccountReceivableModel, 'find').mockReturnValue({ sort: sortMock } as never);
    jest.spyOn(AccountReceivableModel, 'countDocuments').mockResolvedValue(21 as never);
    const repository = new AccountReceivableMongooseRepository();

    const result = await repository.listByRestaurantPage('r-1', { skip: 0, limit: 10 });

    expect(sortMock).toHaveBeenCalledWith({ dueDate: 1 });
    expect(skipMock).toHaveBeenCalledWith(0);
    expect(limitMock).toHaveBeenCalledWith(10);
    expect(result.total).toBe(21);
    expect(result.items.map((a) => a.id)).toEqual(['ar-2']);
  });
});
