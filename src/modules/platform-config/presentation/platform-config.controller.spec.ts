import type { Request, Response, Server } from 'restify';
import type { IPlatformConfigRepository } from '../domain/platform-config.repository.interface';
import { PlatformConfigController } from './platform-config.controller';

type Handler = (req: Request, res: Response) => Promise<void>;

function setup(isCnpjIntegrationsEnabled = false) {
  const platformConfigRepository: IPlatformConfigRepository = {
    isCnpjIntegrationsEnabled: jest.fn().mockResolvedValue(isCnpjIntegrationsEnabled),
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
  it('AC-6: GET /platform/config é público e devolve cnpjIntegrationsEnabled: false por padrão', async () => {
    const { json } = await setup(false).run('GET /platform/config');
    expect(json).toHaveBeenCalledWith(200, { cnpjIntegrationsEnabled: false });
  });

  it('AC-5: GET /platform/config devolve cnpjIntegrationsEnabled: true quando o switch está ligado', async () => {
    const { json } = await setup(true).run('GET /platform/config');
    expect(json).toHaveBeenCalledWith(200, { cnpjIntegrationsEnabled: true });
  });
});
