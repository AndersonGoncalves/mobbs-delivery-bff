import { AccountPayableModel } from '../models/account-payable.mongoose.model';
import { AccountPayableMongooseRepository } from './account-payable.mongoose.repository';

// Achado de auditoria pré-produção (31/10/2026) — "listas sem paginação em financeiro, clientes
// e estoque".
describe('AccountPayableMongooseRepository.listByRestaurantPage (achado de auditoria 2026-10-31)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('pagina no servidor (sort/skip/limit) e devolve o total real, não o total da página', async () => {
    const leanMock = jest.fn().mockResolvedValue([{ _id: 'ap-2', restaurantId: 'r-1', description: 'Água', issueDate: new Date(), dueDate: new Date(), value: 80, status: 'aberto' }]);
    const limitMock = jest.fn().mockReturnValue({ lean: leanMock });
    const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
    const sortMock = jest.fn().mockReturnValue({ skip: skipMock });
    jest.spyOn(AccountPayableModel, 'find').mockReturnValue({ sort: sortMock } as never);
    jest.spyOn(AccountPayableModel, 'countDocuments').mockResolvedValue(53 as never);
    const repository = new AccountPayableMongooseRepository();

    const result = await repository.listByRestaurantPage('r-1', { skip: 10, limit: 10 });

    expect(sortMock).toHaveBeenCalledWith({ dueDate: 1 });
    expect(skipMock).toHaveBeenCalledWith(10);
    expect(limitMock).toHaveBeenCalledWith(10);
    expect(result.total).toBe(53);
    expect(result.items.map((a) => a.id)).toEqual(['ap-2']);
  });
});
