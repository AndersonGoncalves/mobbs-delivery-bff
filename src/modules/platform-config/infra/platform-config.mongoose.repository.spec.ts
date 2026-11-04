import { PLATFORM_CONFIG_SINGLETON_ID, PlatformConfigModel } from './platform-config.mongoose.model';
import { PlatformConfigMongooseRepository } from './platform-config.mongoose.repository';

describe('PlatformConfigMongooseRepository (specs/0201-controle-integracoes-cnpj-plataforma)', () => {
  afterEach(() => jest.restoreAllMocks());

  // ADR-4 — fail-safe: sem documento (ambiente novo, nunca configurado), o valor efetivo é `false`.
  it('AC-6: sem documento, isCnpjIntegrationsEnabled devolve false', async () => {
    const query = PlatformConfigModel.findById(PLATFORM_CONFIG_SINGLETON_ID);
    jest.spyOn(query, 'lean').mockResolvedValue(null);
    jest.spyOn(PlatformConfigModel, 'findById').mockReturnValue(query);

    expect(await new PlatformConfigMongooseRepository().isCnpjIntegrationsEnabled()).toBe(false);
  });

  it('documento com cnpjIntegrationsEnabled: true devolve true', async () => {
    const query = PlatformConfigModel.findById(PLATFORM_CONFIG_SINGLETON_ID);
    const doc = new PlatformConfigModel({ _id: PLATFORM_CONFIG_SINGLETON_ID, cnpjIntegrationsEnabled: true });
    jest.spyOn(query, 'lean').mockResolvedValue(doc.toObject());
    jest.spyOn(PlatformConfigModel, 'findById').mockReturnValue(query);

    expect(await new PlatformConfigMongooseRepository().isCnpjIntegrationsEnabled()).toBe(true);
  });

  it('documento com cnpjIntegrationsEnabled: false devolve false', async () => {
    const query = PlatformConfigModel.findById(PLATFORM_CONFIG_SINGLETON_ID);
    const doc = new PlatformConfigModel({ _id: PLATFORM_CONFIG_SINGLETON_ID, cnpjIntegrationsEnabled: false });
    jest.spyOn(query, 'lean').mockResolvedValue(doc.toObject());
    jest.spyOn(PlatformConfigModel, 'findById').mockReturnValue(query);

    expect(await new PlatformConfigMongooseRepository().isCnpjIntegrationsEnabled()).toBe(false);
  });
});
