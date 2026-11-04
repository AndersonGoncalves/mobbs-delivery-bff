import { RestaurantOperatorModel } from '../models/restaurant-operator.mongoose.model';
import { RestaurantOperatorMongooseRepository } from './restaurant-operator.mongoose.repository';

// Achado de performance da auditoria pré-produção (31/10/2026) — nova consulta em lote,
// substitui o loop de `findById` por id único em `OrdersController.attachCustomers`.
describe('RestaurantOperatorMongooseRepository.findManyByIds', () => {
  afterEach(() => jest.restoreAllMocks());

  it('[] não consulta o banco', async () => {
    const find = jest.spyOn(RestaurantOperatorModel, 'find');
    const result = await new RestaurantOperatorMongooseRepository().findManyByIds([]);
    expect(result).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it('busca todos os ids numa única consulta $in', async () => {
    const docs = [
      { _id: 'm-1', restaurantId: 'r-1', email: 'carlos@exemplo.com', role: 'motoboy', isActive: true, createdAt: new Date() },
      { _id: 'm-2', restaurantId: 'r-1', email: 'ana@exemplo.com', role: 'garcom', isActive: true, createdAt: new Date() },
    ];
    const find = jest.spyOn(RestaurantOperatorModel, 'find').mockReturnValue({ lean: jest.fn().mockResolvedValue(docs) } as never);

    const result = await new RestaurantOperatorMongooseRepository().findManyByIds(['m-1', 'm-2']);

    expect(find).toHaveBeenCalledWith({ _id: { $in: ['m-1', 'm-2'] } });
    expect(result.map((operator) => operator.id)).toEqual(['m-1', 'm-2']);
  });
});

describe('RestaurantOperatorMongooseRepository.updateProfile', () => {
  afterEach(() => jest.restoreAllMocks());

  it('0176: null remove somente photoUrl, preservando os demais campos', async () => {
    const update = jest.spyOn(RestaurantOperatorModel, 'findByIdAndUpdate').mockResolvedValue(null);
    await new RestaurantOperatorMongooseRepository().updateProfile('op-1', { name: 'Ana', photoUrl: null });
    expect(update).toHaveBeenCalledWith('op-1', { $set: { name: 'Ana' }, $unset: { photoUrl: 1 } });
  });

  it('0176: foto omitida não é enviada ao Mongo, preservando o valor anterior', async () => {
    const update = jest.spyOn(RestaurantOperatorModel, 'findByIdAndUpdate').mockResolvedValue(null);
    await new RestaurantOperatorMongooseRepository().updateProfile('op-1', { name: 'Ana', whatsapp: '5585999999999' });
    expect(update).toHaveBeenCalledWith('op-1', { $set: { name: 'Ana', whatsapp: '5585999999999' } });
  });

  it('0176: foto fornecida continua atualizada normalmente', async () => {
    const update = jest.spyOn(RestaurantOperatorModel, 'findByIdAndUpdate').mockResolvedValue(null);
    const profile = { name: 'Ana', photoUrl: 'https://images.example.com/profile.jpg' };
    await new RestaurantOperatorMongooseRepository().updateProfile('op-1', profile);
    expect(update).toHaveBeenCalledWith('op-1', { $set: profile });
  });
});

// specs/0198-rastreamento-motoboy-tempo-real REQ-2.
describe('RestaurantOperatorMongooseRepository.updateLastLocation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sobrescreve lastLocation com lat/lng e updatedAt do momento do update', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-04T12:00:00.000Z'));
    const update = jest.spyOn(RestaurantOperatorModel, 'findByIdAndUpdate').mockResolvedValue(null);

    await new RestaurantOperatorMongooseRepository().updateLastLocation('motoboy-1', -23.55, -46.63);

    expect(update).toHaveBeenCalledWith('motoboy-1', {
      $set: { lastLocation: { lat: -23.55, lng: -46.63, updatedAt: new Date('2026-11-04T12:00:00.000Z') } },
    });
    jest.useRealTimers();
  });
});
