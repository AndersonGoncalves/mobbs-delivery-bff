import { SuggestionRepository } from './suggestion.repository';
import { SuggestionModel, SuggestionReadModel } from './suggestion.model';

jest.mock('./suggestion.model', () => ({
  SuggestionModel: { create: jest.fn(), find: jest.fn(), countDocuments: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn(), aggregate: jest.fn() },
  SuggestionReadModel: { find: jest.fn(), updateOne: jest.fn(), collection: { name: 'suggestion_read' } },
}));

const doc = {
  _id: 's1', restaurantId: 'r1', restaurantName: 'Loja', authorEmail: 'autor@example.com',
  title: 'Recurso', description: 'Descrição detalhada', status: 'received', revision: 2,
  updates: [], createdAt: new Date(), updatedAt: new Date(),
};
const repository = new SuggestionRepository();

beforeEach(() => jest.resetAllMocks());

it('cria entidade com status/revisão padrão definidos pelo schema', async () => {
  const input = { restaurantId: 'r1', restaurantName: 'Loja', authorEmail: 'autor@example.com', title: 'Recurso', description: 'Descrição detalhada' };
  jest.mocked(SuggestionModel.create).mockImplementation(async () => ({ toObject: () => doc }) as never);
  const entity = await repository.create(input);
  expect(SuggestionModel.create).toHaveBeenCalledWith(input);
  expect(entity.id).toBe('s1');
  expect(entity).not.toHaveProperty('_id');
});

it('AC-2/AC-4: pagina no banco e calcula leitura por operador, nao por restaurante', async () => {
  const lean = jest.fn().mockResolvedValue([doc, { ...doc, _id: 's2', revision: 3 }]);
  const limit = jest.fn().mockReturnValue({ lean });
  const skip = jest.fn().mockReturnValue({ limit });
  const sort = jest.fn().mockReturnValue({ skip });
  jest.mocked(SuggestionModel.find).mockReturnValue({ sort } as never);
  jest.mocked(SuggestionModel.countDocuments).mockResolvedValue(25 as never);
  jest.mocked(SuggestionReadModel.find).mockReturnValue({ lean: jest.fn().mockResolvedValue([{ suggestionId: 's1', revision: 2 }]) } as never);
  const result = await repository.list({ page: 2, pageSize: 20, restaurantId: 'r1', operatorId: 'op1', status: 'received' });
  expect(SuggestionModel.find).toHaveBeenCalledWith({ restaurantId: 'r1', status: 'received' });
  expect(sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
  expect(skip).toHaveBeenCalledWith(20);
  expect(limit).toHaveBeenCalledWith(20);
  expect(SuggestionReadModel.find).toHaveBeenCalledWith({ operatorId: 'op1', suggestionId: { $in: ['s1', 's2'] } });
  expect(result.total).toBe(25);
  expect(result.items.map((item) => item.unread)).toEqual([false, true]);
});

it('AC-2: consulta detalhes inclui isolamento na query', async () => {
  jest.mocked(SuggestionModel.findOne).mockReturnValue({ lean: jest.fn().mockResolvedValue(null) } as never);
  expect(await repository.findById('s1', 'r1')).toBeNull();
  expect(SuggestionModel.findOne).toHaveBeenCalledWith({ _id: 's1', restaurantId: 'r1' });
});

it('AC-3: altera status, incrementa revisão e acumula histórico atomicamente', async () => {
  jest.mocked(SuggestionModel.findOneAndUpdate).mockReturnValue({ lean: jest.fn().mockResolvedValue(doc) } as never);
  const update = { status: 'implemented' as const, reply: 'Disponível!', createdAt: new Date() };
  await repository.update('s1', 2, update);
  expect(SuggestionModel.findOneAndUpdate).toHaveBeenCalledWith(
    { _id: 's1', revision: 2 },
    { $set: { status: 'implemented' }, $inc: { revision: 1 }, $push: { updates: update } },
    { new: true },
  );
});

it('AC-4: leitura atrasada usa $max e nao consome revisao nova', async () => {
  jest.mocked(SuggestionReadModel.updateOne).mockResolvedValue({} as never);
  await repository.markRead('s1', 'op1', 1);
  expect(SuggestionReadModel.updateOne).toHaveBeenCalledWith(
    { suggestionId: 's1', operatorId: 'op1' }, { $max: { revision: 1 } }, { upsert: true },
  );
});

it('AC-4: contador filtra loja, cruza operador e compara revisao persistida', async () => {
  jest.mocked(SuggestionModel.aggregate).mockResolvedValue([{ count: 2 }]);
  expect(await repository.unreadCount('r1', 'op1')).toBe(2);
  const pipeline = jest.mocked(SuggestionModel.aggregate).mock.calls[0][0];
  expect(pipeline[0]).toEqual({ $match: { restaurantId: 'r1', revision: { $gt: 0 } } });
  expect(pipeline[1]).toMatchObject({ $lookup: { from: 'suggestion_read', pipeline: [
    { $match: { $expr: { $and: [
      { $eq: ['$suggestionId', '$$suggestionId'] },
      { $eq: ['$operatorId', { $literal: 'op1' }] },
    ] } } },
  ] } });
  expect(pipeline[2]).toEqual({ $match: { $expr: { $gt: ['$revision', { $ifNull: [{ $arrayElemAt: ['$reads.revision', 0] }, 0] }] } } });
  jest.mocked(SuggestionModel.aggregate).mockResolvedValue([]);
  expect(await repository.unreadCount('r1', 'op2')).toBe(0);
});
