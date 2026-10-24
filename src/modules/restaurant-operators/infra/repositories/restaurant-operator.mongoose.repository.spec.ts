import { RestaurantOperatorModel } from '../models/restaurant-operator.mongoose.model';
import { RestaurantOperatorMongooseRepository } from './restaurant-operator.mongoose.repository';

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
