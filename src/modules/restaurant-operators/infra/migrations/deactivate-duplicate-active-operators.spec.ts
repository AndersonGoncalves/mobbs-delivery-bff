import { RestaurantOperatorModel } from '../models/restaurant-operator.mongoose.model';
import { deactivateDuplicateActiveOperators } from './deactivate-duplicate-active-operators';

// Mesmo racional de `migrate-operator-roles-to-dono.spec.ts` — mock do Model, não integração
// real de Mongo.
jest.mock('../models/restaurant-operator.mongoose.model', () => ({
  RestaurantOperatorModel: { aggregate: jest.fn(), updateMany: jest.fn() },
}));

describe('deactivateDuplicateActiveOperators', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('mantém só o vínculo ativo mais recente por e-mail e desativa os demais', async () => {
    (RestaurantOperatorModel.aggregate as jest.Mock).mockResolvedValue([
      { _id: 'operador@exemplo.com', ids: ['mais-recente', 'mais-antigo-1', 'mais-antigo-2'] },
    ]);
    (RestaurantOperatorModel.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 2 });

    await deactivateDuplicateActiveOperators();

    expect(RestaurantOperatorModel.aggregate).toHaveBeenCalledWith([
      { $match: { isActive: true } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$email', ids: { $push: '$_id' } } },
      { $match: { 'ids.1': { $exists: true } } },
    ]);
    expect(RestaurantOperatorModel.updateMany).toHaveBeenCalledWith(
      { _id: { $in: ['mais-antigo-1', 'mais-antigo-2'] } },
      { $set: { isActive: false } },
    );
  });

  it('é idempotente: sem nenhum e-mail duplicado ativo, não chama updateMany', async () => {
    (RestaurantOperatorModel.aggregate as jest.Mock).mockResolvedValue([]);

    await deactivateDuplicateActiveOperators();

    expect(RestaurantOperatorModel.updateMany).not.toHaveBeenCalled();
  });
});
