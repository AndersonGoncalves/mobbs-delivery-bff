import { FiscalConfigModel } from '../models/fiscal-config.mongoose.model';
import { FiscalConfigMongooseRepository } from './fiscal-config.mongoose.repository';

describe('FiscalConfigMongooseRepository (specs/0091-integracao-fiscal-focusnfe)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('findByRestaurantId: sem documento devolve null', async () => {
    const query = FiscalConfigModel.findOne({ restaurantId: 'r-1' });
    jest.spyOn(query, 'lean').mockResolvedValue(null);
    jest.spyOn(FiscalConfigModel, 'findOne').mockReturnValue(query);

    const result = await new FiscalConfigMongooseRepository().findByRestaurantId('r-1');

    expect(result).toBeNull();
  });

  it('upsert: documento novo gera webhookToken automaticamente e começa com productionEnabled false', async () => {
    const findQuery = FiscalConfigModel.findOne({ restaurantId: 'r-1' });
    jest.spyOn(findQuery, 'lean').mockResolvedValue(null);
    jest.spyOn(FiscalConfigModel, 'findOne').mockReturnValue(findQuery);

    const updateQuery = FiscalConfigModel.findOneAndUpdate({ restaurantId: 'r-1' }, {});
    const now = new Date();
    jest.spyOn(updateQuery, 'lean').mockResolvedValue({
      restaurantId: 'r-1',
      focusNfeToken: 'token-1',
      environment: 'homologacao',
      documentType: 'nfce',
      productionEnabled: false,
      webhookToken: 'gerado-automaticamente',
      cnpj: '11222333000181',
      createdAt: now,
      updatedAt: now,
    });
    const findOneAndUpdate = jest.spyOn(FiscalConfigModel, 'findOneAndUpdate').mockReturnValue(updateQuery);

    const result = await new FiscalConfigMongooseRepository().upsert('r-1', {
      focusNfeToken: 'token-1',
      environment: 'homologacao',
      documentType: 'nfce',
      cnpj: '11222333000181',
    });

    const [, update] = findOneAndUpdate.mock.calls[0];
    expect((update as Record<string, unknown>).$set).toMatchObject({ focusNfeToken: 'token-1', environment: 'homologacao', documentType: 'nfce', cnpj: '11222333000181' });
    expect((update as Record<string, unknown>).$set).toHaveProperty('webhookToken');
    expect(result.webhookToken).toBe('gerado-automaticamente');
  });

  it('upsert: documento existente PRESERVA o webhookToken já gerado (nunca troca ao editar token/ambiente)', async () => {
    const findQuery = FiscalConfigModel.findOne({ restaurantId: 'r-1' });
    jest.spyOn(findQuery, 'lean').mockResolvedValue({ webhookToken: 'webhook-ja-existente' });
    jest.spyOn(FiscalConfigModel, 'findOne').mockReturnValue(findQuery);

    const updateQuery = FiscalConfigModel.findOneAndUpdate({ restaurantId: 'r-1' }, {});
    jest.spyOn(updateQuery, 'lean').mockResolvedValue({
      restaurantId: 'r-1',
      focusNfeToken: 'token-novo',
      environment: 'producao',
      documentType: 'nfce',
      productionEnabled: true,
      webhookToken: 'webhook-ja-existente',
      cnpj: '11222333000181',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const findOneAndUpdate = jest.spyOn(FiscalConfigModel, 'findOneAndUpdate').mockReturnValue(updateQuery);

    await new FiscalConfigMongooseRepository().upsert('r-1', {
      focusNfeToken: 'token-novo',
      environment: 'producao',
      documentType: 'nfce',
      cnpj: '11222333000181',
    });

    const [, update] = findOneAndUpdate.mock.calls[0];
    expect((update as Record<string, unknown>).$set).toMatchObject({ webhookToken: 'webhook-ja-existente' });
  });

  it('setProductionEnabled: "botão de ativar produção" liga/desliga sem tocar no resto da config', async () => {
    const updateQuery = FiscalConfigModel.findOneAndUpdate({ restaurantId: 'r-1' }, {});
    jest.spyOn(updateQuery, 'lean').mockResolvedValue({
      restaurantId: 'r-1',
      focusNfeToken: 'token-1',
      environment: 'producao',
      documentType: 'nfce',
      productionEnabled: true,
      webhookToken: 'webhook-1',
      cnpj: '11222333000181',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const findOneAndUpdate = jest.spyOn(FiscalConfigModel, 'findOneAndUpdate').mockReturnValue(updateQuery);

    const result = await new FiscalConfigMongooseRepository().setProductionEnabled('r-1', true);

    expect(findOneAndUpdate).toHaveBeenCalledWith({ restaurantId: 'r-1' }, { $set: { productionEnabled: true } }, { new: true });
    expect(result.productionEnabled).toBe(true);
  });

  it('setProductionEnabled: sem config cadastrada lança erro (nada pra ligar)', async () => {
    const updateQuery = FiscalConfigModel.findOneAndUpdate({ restaurantId: 'r-1' }, {});
    jest.spyOn(updateQuery, 'lean').mockResolvedValue(null);
    jest.spyOn(FiscalConfigModel, 'findOneAndUpdate').mockReturnValue(updateQuery);

    await expect(new FiscalConfigMongooseRepository().setProductionEnabled('r-1', true)).rejects.toThrow('Configuração fiscal não encontrada');
  });

  it('delete: remove o documento do restaurante', async () => {
    const deleteOne = jest.spyOn(FiscalConfigModel, 'deleteOne').mockResolvedValue({ acknowledged: true, deletedCount: 1 });

    await new FiscalConfigMongooseRepository().delete('r-1');

    expect(deleteOne).toHaveBeenCalledWith({ restaurantId: 'r-1' });
  });

  it('schema Mongo exige os campos obrigatórios', async () => {
    const doc = new FiscalConfigModel({ restaurantId: 'r-1' });
    await expect(doc.validate()).rejects.toThrow();
  });
});
