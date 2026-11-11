import type { Request, Response, Server } from 'restify';
import type { IPlatformConfigRepository, PlatformConfigSnapshot } from '../domain/platform-config.repository.interface';
import { PlatformConfigController } from './platform-config.controller';

type Handler = (req: Request, res: Response) => Promise<void>;

function buildSnapshot(overrides: Partial<PlatformConfigSnapshot> = {}): PlatformConfigSnapshot {
  return {
    cnpjIntegrationsEnabled: false,
    kdsAppEnabled: false,
    comandaAppEnabled: false,
    totemAppEnabled: false,
    instagramAutomationEnabled: false,
    ...overrides,
  };
}

function setup(snapshot: PlatformConfigSnapshot = buildSnapshot()) {
  const platformConfigRepository: IPlatformConfigRepository = {
    isCnpjIntegrationsEnabled: jest.fn(),
    isKdsAppEnabled: jest.fn(),
    isComandaAppEnabled: jest.fn(),
    isTotemAppEnabled: jest.fn(),
    isInstagramAutomationEnabled: jest.fn(),
    getSnapshot: jest.fn().mockResolvedValue(snapshot),
  };
  const routes: Record<string, Handler[]> = {};
  const register = (method: string) => (path: string, ...handlers: Handler[]) => { routes[`${method} ${path}`] = handlers; };
  new PlatformConfigController(platformConfigRepository).initializeRoutes({ get: register('GET') } as unknown as Server);
  async function run(route: string) {
    const json = jest.fn();
    for (const handler of routes[route]) await handler({} as Request, { json } as unknown as Response);
    return { json };
  }
  return { platformConfigRepository, run };
}

describe('PlatformConfigController (specs/0201-controle-integracoes-cnpj-plataforma)', () => {
  // ADR-3 — endpoint público, sem auth (não há middleware antes do handler na rota registrada).
  it('AC-6: GET /platform/config é público e devolve tudo desligado por padrão', async () => {
    const { json } = await setup().run('GET /platform/config');
    expect(json).toHaveBeenCalledWith(200, {
      cnpjIntegrationsEnabled: false,
      cnpjIntegrationsIsNew: false,
      kdsAppEnabled: false,
      kdsAppIsNew: false,
      comandaAppEnabled: false,
      comandaAppIsNew: false,
      totemAppEnabled: false,
      totemAppIsNew: false,
      instagramAutomationEnabled: false,
      instagramAutomationIsNew: false,
    });
  });

  it('AC-5: GET /platform/config devolve cnpjIntegrationsEnabled: true quando o switch está ligado', async () => {
    const { json } = await setup(buildSnapshot({ cnpjIntegrationsEnabled: true })).run('GET /platform/config');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ cnpjIntegrationsEnabled: true }));
  });

  // (ajuste 10/11/2026, pedido explícito do usuário) — os switches de app, cada um
  // independente dos outros (e do switch de CNPJ). (ajuste 11/11/2026) — Automação Instagram junto.
  it('devolve kdsAppEnabled/comandaAppEnabled/totemAppEnabled/instagramAutomationEnabled, cada um independente dos outros', async () => {
    const { json } = await setup(buildSnapshot({ kdsAppEnabled: true })).run('GET /platform/config');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({
      cnpjIntegrationsEnabled: false,
      kdsAppEnabled: true,
      comandaAppEnabled: false,
      totemAppEnabled: false,
      instagramAutomationEnabled: false,
    }));
  });

  it('devolve instagramAutomationEnabled: true quando o switch está ligado', async () => {
    const { json } = await setup(buildSnapshot({ instagramAutomationEnabled: true })).run('GET /platform/config');
    expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ instagramAutomationEnabled: true }));
  });

  // (ajuste 11/11/2026, pedido explícito do usuário) — tag "Novo" no menu: cada `<switch>IsNew`
  // só é `true` nos primeiros 10 dias depois do `<switch>EnabledAt` (carimbado pelo script de
  // ativação) — depois disso, ou se o switch nunca foi ativado, ou se está desligado, some.
  describe('isNew (tag "Novo" no menu)', () => {
    it('isNew é true quando o switch foi ativado há menos de 10 dias', async () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const { json } = await setup(buildSnapshot({ kdsAppEnabled: true, kdsAppEnabledAt: fiveDaysAgo })).run('GET /platform/config');
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ kdsAppIsNew: true }));
    });

    it('isNew é false quando o switch foi ativado há mais de 10 dias', async () => {
      const elevenDaysAgo = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000);
      const { json } = await setup(buildSnapshot({ kdsAppEnabled: true, kdsAppEnabledAt: elevenDaysAgo })).run('GET /platform/config');
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ kdsAppIsNew: false }));
    });

    it('isNew é false quando o switch nunca foi ativado (sem enabledAt), mesmo que enabled seja true', async () => {
      const { json } = await setup(buildSnapshot({ kdsAppEnabled: true, kdsAppEnabledAt: undefined })).run('GET /platform/config');
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ kdsAppIsNew: false }));
    });

    it('isNew é false quando o switch está desligado, mesmo com enabledAt recente (desligou depois de ativar)', async () => {
      const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
      const { json } = await setup(buildSnapshot({ kdsAppEnabled: false, kdsAppEnabledAt: oneDayAgo })).run('GET /platform/config');
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ kdsAppIsNew: false }));
    });

    it('cada switch calcula isNew de forma independente', async () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const elevenDaysAgo = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000);
      const { json } = await setup(buildSnapshot({
        kdsAppEnabled: true,
        kdsAppEnabledAt: fiveDaysAgo,
        comandaAppEnabled: true,
        comandaAppEnabledAt: elevenDaysAgo,
      })).run('GET /platform/config');
      expect(json).toHaveBeenCalledWith(200, expect.objectContaining({ kdsAppIsNew: true, comandaAppIsNew: false }));
    });
  });
});
