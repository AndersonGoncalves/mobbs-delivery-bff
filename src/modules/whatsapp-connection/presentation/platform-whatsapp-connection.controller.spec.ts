import type { Response, Server } from 'restify';

import { IPlatformWhatsAppConnectionService } from '../domain/services/i-platform-whatsapp-connection.service';
import { PlatformWhatsAppConnectionController } from './platform-whatsapp-connection.controller';

type FakeRequest = Record<string, never>;
type FakeResponse = Partial<Pick<Response, 'json' | 'send'>>;
type RouteHandler = (req: FakeRequest, res: FakeResponse) => Promise<void>;

function buildFakeApplication() {
  const routes: Record<string, RouteHandler[]> = {};
  const application = {
    post: (path: string, ...handlers: RouteHandler[]) => {
      routes[`POST ${path}`] = handlers;
    },
    get: (path: string, ...handlers: RouteHandler[]) => {
      routes[`GET ${path}`] = handlers;
    },
    del: (path: string, ...handlers: RouteHandler[]) => {
      routes[`DEL ${path}`] = handlers;
    },
  };
  return { application: application as unknown as Server, routes };
}

// `/platform/*` passa por firebaseAuthMiddleware + platformAdminMiddleware — pula os dois, mesmo
// padrão de `prospects.controller.spec.ts`.
async function runAdminChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(2)) {
    await handler(req, res);
  }
}

describe('PlatformWhatsAppConnectionController (specs/0124-campanha-whatsapp-prospects)', () => {
  function setup(overrides: Partial<IPlatformWhatsAppConnectionService> = {}) {
    const platformWhatsAppConnectionService: IPlatformWhatsAppConnectionService = {
      startPairing: jest.fn().mockResolvedValue('qr-code-data'),
      getConnectionStatus: jest.fn().mockResolvedValue(false),
      disconnect: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendImageMessage: jest.fn().mockResolvedValue(undefined),
      restoreConnectedSession: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
    const { application, routes } = buildFakeApplication();
    new PlatformWhatsAppConnectionController(platformWhatsAppConnectionService, jest.fn()).initializeRoutes(application);
    return { platformWhatsAppConnectionService, routes };
  }

  // AC-2
  it('POST /platform/whatsapp/pairing inicia o pareamento e devolve o QR', async () => {
    const { platformWhatsAppConnectionService, routes } = setup();
    const json = jest.fn();

    await runAdminChain(routes['POST /platform/whatsapp/pairing'], {}, { json });

    expect(platformWhatsAppConnectionService.startPairing).toHaveBeenCalledWith();
    expect(json).toHaveBeenCalledWith(200, { qr: 'qr-code-data' });
  });

  it('GET /platform/whatsapp/status devolve o estado de conexão da sessão da plataforma', async () => {
    const { routes } = setup({ getConnectionStatus: jest.fn().mockResolvedValue(true) });
    const json = jest.fn();

    await runAdminChain(routes['GET /platform/whatsapp/status'], {}, { json });

    expect(json).toHaveBeenCalledWith(200, { connected: true });
  });

  it('DEL /platform/whatsapp desconecta a sessão da plataforma', async () => {
    const { platformWhatsAppConnectionService, routes } = setup();
    const send = jest.fn();

    await runAdminChain(routes['DEL /platform/whatsapp'], {}, { send });

    expect(platformWhatsAppConnectionService.disconnect).toHaveBeenCalledWith();
    expect(send).toHaveBeenCalledWith(204);
  });
});
