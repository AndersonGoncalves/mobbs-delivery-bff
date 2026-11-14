import { PLATFORM_CONFIG_SINGLETON_ID, PlatformConfigModel } from './platform-config.mongoose.model';
import { PlatformConfigMongooseRepository } from './platform-config.mongoose.repository';

function mockDoc(data: Record<string, unknown> | null) {
  const query = PlatformConfigModel.findById(PLATFORM_CONFIG_SINGLETON_ID);
  jest.spyOn(query, 'lean').mockResolvedValue(data === null ? null : new PlatformConfigModel({ _id: PLATFORM_CONFIG_SINGLETON_ID, ...data }).toObject());
  jest.spyOn(PlatformConfigModel, 'findById').mockReturnValue(query);
}

describe('PlatformConfigMongooseRepository (specs/0209-desacoplar-integracoes-cnpj-plataforma)', () => {
  afterEach(() => jest.restoreAllMocks());

  // ADR-4 — fail-safe: sem documento (ambiente novo, nunca configurado), o valor efetivo é `false`.
  it('AC-6: sem documento, isAsaasIntegrationEnabled/isMercadoPagoIntegrationEnabled/isIfoodIntegrationEnabled/isNinetyNineFoodIntegrationEnabled devolvem false', async () => {
    mockDoc(null);
    const repository = new PlatformConfigMongooseRepository();
    expect(await repository.isAsaasIntegrationEnabled()).toBe(false);
    expect(await repository.isMercadoPagoIntegrationEnabled()).toBe(false);
    expect(await repository.isIfoodIntegrationEnabled()).toBe(false);
    expect(await repository.isNinetyNineFoodIntegrationEnabled()).toBe(false);
  });

  it('cada switch de integração reflete só o próprio campo, independente dos outros', async () => {
    mockDoc({ asaasIntegrationEnabled: true, mercadoPagoIntegrationEnabled: false, ifoodIntegrationEnabled: false, ninetyNineFoodIntegrationEnabled: false });
    const repository = new PlatformConfigMongooseRepository();
    expect(await repository.isAsaasIntegrationEnabled()).toBe(true);
    expect(await repository.isMercadoPagoIntegrationEnabled()).toBe(false);
    expect(await repository.isIfoodIntegrationEnabled()).toBe(false);
    expect(await repository.isNinetyNineFoodIntegrationEnabled()).toBe(false);
  });

  it('isMercadoPagoIntegrationEnabled/isIfoodIntegrationEnabled/isNinetyNineFoodIntegrationEnabled também refletem o documento quando ligados', async () => {
    mockDoc({ asaasIntegrationEnabled: false, mercadoPagoIntegrationEnabled: true, ifoodIntegrationEnabled: true, ninetyNineFoodIntegrationEnabled: true });
    const repository = new PlatformConfigMongooseRepository();
    expect(await repository.isAsaasIntegrationEnabled()).toBe(false);
    expect(await repository.isMercadoPagoIntegrationEnabled()).toBe(true);
    expect(await repository.isIfoodIntegrationEnabled()).toBe(true);
    expect(await repository.isNinetyNineFoodIntegrationEnabled()).toBe(true);
  });

  // (ajuste 10/11/2026, pedido explícito do usuário) — mesmo fail-safe (ADR-4) e mesma
  // independência entre switches dos novos campos (KDS/Comanda/Totem/Automação Instagram).
  it('AC-6 (KDS/Comanda/Totem/Instagram): sem documento, todos devolvem false', async () => {
    mockDoc(null);
    const repository = new PlatformConfigMongooseRepository();
    expect(await repository.isKdsAppEnabled()).toBe(false);
    expect(await repository.isComandaAppEnabled()).toBe(false);
    expect(await repository.isTotemAppEnabled()).toBe(false);
    expect(await repository.isInstagramAutomationEnabled()).toBe(false);
  });

  it('cada switch de app reflete só o próprio campo, independente dos outros', async () => {
    mockDoc({ kdsAppEnabled: true, comandaAppEnabled: false, totemAppEnabled: false, instagramAutomationEnabled: false });
    const repository = new PlatformConfigMongooseRepository();
    expect(await repository.isKdsAppEnabled()).toBe(true);
    expect(await repository.isComandaAppEnabled()).toBe(false);
    expect(await repository.isTotemAppEnabled()).toBe(false);
    expect(await repository.isInstagramAutomationEnabled()).toBe(false);
  });

  it('isComandaAppEnabled/isTotemAppEnabled/isInstagramAutomationEnabled também refletem o documento quando ligados', async () => {
    mockDoc({ kdsAppEnabled: false, comandaAppEnabled: true, totemAppEnabled: true, instagramAutomationEnabled: true });
    const repository = new PlatformConfigMongooseRepository();
    expect(await repository.isKdsAppEnabled()).toBe(false);
    expect(await repository.isComandaAppEnabled()).toBe(true);
    expect(await repository.isTotemAppEnabled()).toBe(true);
    expect(await repository.isInstagramAutomationEnabled()).toBe(true);
  });

  // (ajuste 11/11/2026, pedido explícito do usuário) — `getSnapshot` devolve booleano + carimbo de
  // ativação de cada switch, usado pelo controller só pra calcular a tag "Novo" do menu.
  describe('getSnapshot', () => {
    it('sem documento, devolve tudo desligado e sem nenhum carimbo', async () => {
      mockDoc(null);
      const snapshot = await new PlatformConfigMongooseRepository().getSnapshot();
      expect(snapshot).toEqual({
        asaasIntegrationEnabled: false,
        asaasIntegrationEnabledAt: undefined,
        mercadoPagoIntegrationEnabled: false,
        mercadoPagoIntegrationEnabledAt: undefined,
        ifoodIntegrationEnabled: false,
        ifoodIntegrationEnabledAt: undefined,
        ninetyNineFoodIntegrationEnabled: false,
        ninetyNineFoodIntegrationEnabledAt: undefined,
        kdsAppEnabled: false,
        kdsAppEnabledAt: undefined,
        comandaAppEnabled: false,
        comandaAppEnabledAt: undefined,
        totemAppEnabled: false,
        totemAppEnabledAt: undefined,
        instagramAutomationEnabled: false,
        instagramAutomationEnabledAt: undefined,
      });
    });

    it('devolve o carimbo de ativação de cada switch junto do booleano', async () => {
      const kdsAppEnabledAt = new Date('2026-11-05T12:00:00.000Z');
      mockDoc({ kdsAppEnabled: true, kdsAppEnabledAt });
      const snapshot = await new PlatformConfigMongooseRepository().getSnapshot();
      expect(snapshot.kdsAppEnabled).toBe(true);
      expect(snapshot.kdsAppEnabledAt).toEqual(kdsAppEnabledAt);
      // Os outros switches continuam desligados e sem carimbo, independentes do KDS.
      expect(snapshot.comandaAppEnabled).toBe(false);
      expect(snapshot.comandaAppEnabledAt).toBeUndefined();
    });
  });
});
