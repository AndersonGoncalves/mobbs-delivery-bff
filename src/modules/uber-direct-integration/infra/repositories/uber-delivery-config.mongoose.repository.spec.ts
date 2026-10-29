import { UberDeliveryConfigModel } from '../models/uber-delivery-config.mongoose.model';
import { UberDeliveryConfigMongooseRepository } from './uber-delivery-config.mongoose.repository';

describe('UberDeliveryConfigMongooseRepository (specs/0121-integracao-uber-entregas)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('findByRestaurantId: sem documento devolve null', async () => {
    const query = UberDeliveryConfigModel.findOne({ restaurantId: 'r-1' });
    jest.spyOn(query, 'lean').mockResolvedValue(null);
    jest.spyOn(UberDeliveryConfigModel, 'findOne').mockReturnValue(query);

    const result = await new UberDeliveryConfigMongooseRepository().findByRestaurantId('r-1');

    expect(result).toBeNull();
  });

  it('upsert: documento novo gera webhookToken automaticamente', async () => {
    const findQuery = UberDeliveryConfigModel.findOne({ restaurantId: 'r-1' });
    jest.spyOn(findQuery, 'lean').mockResolvedValue(null);
    jest.spyOn(UberDeliveryConfigModel, 'findOne').mockReturnValue(findQuery);

    const updateQuery = UberDeliveryConfigModel.findOneAndUpdate({ restaurantId: 'r-1' }, {});
    const now = new Date();
    jest.spyOn(updateQuery, 'lean').mockResolvedValue({
      restaurantId: 'r-1',
      customerId: 'uber-customer-1',
      clientId: 'client-1',
      clientSecret: 'secret-1',
      originZipCode: '01000000',
      webhookToken: 'gerado-automaticamente',
      createdAt: now,
      updatedAt: now,
    });
    const findOneAndUpdate = jest.spyOn(UberDeliveryConfigModel, 'findOneAndUpdate').mockReturnValue(updateQuery);

    const result = await new UberDeliveryConfigMongooseRepository().upsert('r-1', {
      customerId: 'uber-customer-1',
      clientId: 'client-1',
      clientSecret: 'secret-1',
      originZipCode: '01000000',
    });

    const [, update] = findOneAndUpdate.mock.calls[0];
    expect((update as Record<string, unknown>).$set).toMatchObject({ customerId: 'uber-customer-1', clientId: 'client-1' });
    expect((update as Record<string, unknown>).$set).toHaveProperty('webhookToken');
    expect(result.webhookToken).toBe('gerado-automaticamente');
  });

  it('upsert: documento existente PRESERVA o webhookToken já gerado', async () => {
    const findQuery = UberDeliveryConfigModel.findOne({ restaurantId: 'r-1' });
    jest.spyOn(findQuery, 'lean').mockResolvedValue({ webhookToken: 'webhook-ja-existente' });
    jest.spyOn(UberDeliveryConfigModel, 'findOne').mockReturnValue(findQuery);

    const updateQuery = UberDeliveryConfigModel.findOneAndUpdate({ restaurantId: 'r-1' }, {});
    jest.spyOn(updateQuery, 'lean').mockResolvedValue({
      restaurantId: 'r-1',
      customerId: 'uber-customer-1',
      clientId: 'client-novo',
      clientSecret: 'secret-novo',
      originZipCode: '01000000',
      webhookToken: 'webhook-ja-existente',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const findOneAndUpdate = jest.spyOn(UberDeliveryConfigModel, 'findOneAndUpdate').mockReturnValue(updateQuery);

    await new UberDeliveryConfigMongooseRepository().upsert('r-1', {
      customerId: 'uber-customer-1',
      clientId: 'client-novo',
      clientSecret: 'secret-novo',
      originZipCode: '01000000',
    });

    const [, update] = findOneAndUpdate.mock.calls[0];
    expect((update as Record<string, unknown>).$set).toMatchObject({ webhookToken: 'webhook-ja-existente' });
  });

  it('delete: remove o documento do restaurante', async () => {
    const deleteOne = jest.spyOn(UberDeliveryConfigModel, 'deleteOne').mockResolvedValue({ acknowledged: true, deletedCount: 1 });

    await new UberDeliveryConfigMongooseRepository().delete('r-1');

    expect(deleteOne).toHaveBeenCalledWith({ restaurantId: 'r-1' });
  });

  it('schema Mongo exige os campos obrigatórios', async () => {
    const doc = new UberDeliveryConfigModel({ restaurantId: 'r-1' });
    await expect(doc.validate()).rejects.toThrow();
  });
});
