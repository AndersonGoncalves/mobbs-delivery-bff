import { DEFAULT_SUPPORT_SETTINGS } from '../domain/support-settings';
import { SupportSettingsModel, SUPPORT_SETTINGS_SINGLETON_ID } from './support-settings.mongoose.model';
import { SupportSettingsMongooseRepository } from './support-settings.mongoose.repository';

describe('SupportSettingsMongooseRepository - 0181', () => {
  afterEach(() => jest.restoreAllMocks());

  it('retorna defaults apenas quando nao existe documento', async () => {
    const query = SupportSettingsModel.findById(SUPPORT_SETTINGS_SINGLETON_ID);
    jest.spyOn(query, 'lean').mockResolvedValue(null);
    const find = jest.spyOn(SupportSettingsModel, 'findById').mockReturnValue(query);
    const settings = await new SupportSettingsMongooseRepository().get();
    expect(find).toHaveBeenCalledWith('singleton');
    expect(settings).toEqual(DEFAULT_SUPPORT_SETTINGS);
    expect(settings).not.toBe(DEFAULT_SUPPORT_SETTINGS);
  });

  it('nova instancia le configuracao persistida e exclui metadados da resposta', async () => {
    const query = SupportSettingsModel.findById(SUPPORT_SETTINGS_SINGLETON_ID);
    const saved = { ...DEFAULT_SUPPORT_SETTINGS, trainingUnlimitedItems: false, trainingPriceCents: 0 };
    const doc = new SupportSettingsModel({ _id: 'singleton', ...saved });
    jest.spyOn(query, 'lean').mockResolvedValue(doc.toObject());
    jest.spyOn(SupportSettingsModel, 'findById').mockReturnValue(query);
    const result = await new SupportSettingsMongooseRepository().get();
    expect(result).toEqual(saved);
    expect(result).not.toHaveProperty('_id');
    expect(result).not.toHaveProperty('createdAt');
  });

  it('faz upsert validado sempre no mesmo singleton', async () => {
    const update = jest.spyOn(SupportSettingsModel, 'findByIdAndUpdate').mockResolvedValue(null);
    const result = await new SupportSettingsMongooseRepository().update({ ...DEFAULT_SUPPORT_SETTINGS });
    expect(update).toHaveBeenCalledWith('singleton', { $set: DEFAULT_SUPPORT_SETTINGS }, { upsert: true, runValidators: true });
    expect(result).toEqual(DEFAULT_SUPPORT_SETTINGS);
  });

  it('nao disfarca falha de persistencia com defaults ou sucesso', async () => {
    const query = SupportSettingsModel.findById(SUPPORT_SETTINGS_SINGLETON_ID);
    jest.spyOn(query, 'lean').mockRejectedValue(new Error('Mongo offline'));
    jest.spyOn(SupportSettingsModel, 'findById').mockReturnValue(query);
    const repository = new SupportSettingsMongooseRepository();
    await expect(repository.get()).rejects.toThrow('Mongo offline');
    jest.spyOn(SupportSettingsModel, 'findByIdAndUpdate').mockRejectedValue(new Error('Falha de escrita'));
    await expect(repository.update({ ...DEFAULT_SUPPORT_SETTINGS })).rejects.toThrow('Falha de escrita');
  });

  it('schema Mongo rejeita preco negativo e contatos ausentes', async () => {
    const doc = new SupportSettingsModel({ ...DEFAULT_SUPPORT_SETTINGS, whatsapp: '', trainingPriceCents: -1 });
    await expect(doc.validate()).rejects.toThrow();
  });
});
