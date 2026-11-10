import { PLATFORM_CONFIG_SINGLETON_ID, PlatformConfigModel } from './platform-config.mongoose.model';
import { PlatformConfigMongooseRepository } from './platform-config.mongoose.repository';

function mockDoc(data: Record<string, unknown> | null) {
  const query = PlatformConfigModel.findById(PLATFORM_CONFIG_SINGLETON_ID);
  jest.spyOn(query, 'lean').mockResolvedValue(data === null ? null : new PlatformConfigModel({ _id: PLATFORM_CONFIG_SINGLETON_ID, ...data }).toObject());
  jest.spyOn(PlatformConfigModel, 'findById').mockReturnValue(query);
}

describe('PlatformConfigMongooseRepository (specs/0201-controle-integracoes-cnpj-plataforma)', () => {
  afterEach(() => jest.restoreAllMocks());

  // ADR-4 — fail-safe: sem documento (ambiente novo, nunca configurado), o valor efetivo é `false`.
  it('AC-6: sem documento, isCnpjIntegrationsEnabled devolve false', async () => {
    mockDoc(null);
    expect(await new PlatformConfigMongooseRepository().isCnpjIntegrationsEnabled()).toBe(false);
  });

  it('documento com cnpjIntegrationsEnabled: true devolve true', async () => {
    mockDoc({ cnpjIntegrationsEnabled: true });
    expect(await new PlatformConfigMongooseRepository().isCnpjIntegrationsEnabled()).toBe(true);
  });

  it('documento com cnpjIntegrationsEnabled: false devolve false', async () => {
    mockDoc({ cnpjIntegrationsEnabled: false });
    expect(await new PlatformConfigMongooseRepository().isCnpjIntegrationsEnabled()).toBe(false);
  });

  // (ajuste 10/11/2026, pedido explícito do usuário) — mesmo fail-safe (ADR-4) e mesma
  // independência entre switches dos 3 novos campos (KDS/Comanda/Totem).
  it('AC-6 (KDS/Comanda/Totem): sem documento, todos devolvem false', async () => {
    mockDoc(null);
    const repository = new PlatformConfigMongooseRepository();
    expect(await repository.isKdsAppEnabled()).toBe(false);
    expect(await repository.isComandaAppEnabled()).toBe(false);
    expect(await repository.isTotemAppEnabled()).toBe(false);
  });

  it('cada switch de app reflete só o próprio campo, independente dos outros', async () => {
    mockDoc({ kdsAppEnabled: true, comandaAppEnabled: false, totemAppEnabled: false });
    const repository = new PlatformConfigMongooseRepository();
    expect(await repository.isKdsAppEnabled()).toBe(true);
    expect(await repository.isComandaAppEnabled()).toBe(false);
    expect(await repository.isTotemAppEnabled()).toBe(false);
  });

  it('isComandaAppEnabled/isTotemAppEnabled também refletem o documento quando ligados', async () => {
    mockDoc({ kdsAppEnabled: false, comandaAppEnabled: true, totemAppEnabled: true });
    const repository = new PlatformConfigMongooseRepository();
    expect(await repository.isKdsAppEnabled()).toBe(false);
    expect(await repository.isComandaAppEnabled()).toBe(true);
    expect(await repository.isTotemAppEnabled()).toBe(true);
  });
});
