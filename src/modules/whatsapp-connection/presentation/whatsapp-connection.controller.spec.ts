import type { Response, Server } from 'restify';

import { IWhatsAppConnectionService } from '../domain/services/i-whatsapp-connection.service';
import { WhatsAppConnectionController } from './whatsapp-connection.controller';

type FakeRequest = { restaurantId?: string };
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

// Pula firebaseAuthMiddleware + restaurantOperatorMiddleware (cada um com spec própria) e
// injeta `req.restaurantId` manualmente, como os middlewares reais fariam.
async function runOperatorChain(handlers: RouteHandler[], req: FakeRequest, res: FakeResponse): Promise<void> {
  for (const handler of handlers.slice(2)) {
    await handler(req, res);
  }
}

describe('WhatsAppConnectionController', () => {
  function setup(overrides: Partial<IWhatsAppConnectionService> = {}) {
    const whatsAppConnectionService: IWhatsAppConnectionService = {
      startPairing: jest.fn().mockResolvedValue('qr-code-data'),
      getConnectionStatus: jest.fn().mockResolvedValue(false),
      disconnect: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
    const { application, routes } = buildFakeApplication();
    new WhatsAppConnectionController(whatsAppConnectionService, jest.fn()).initializeRoutes(application);
    return { whatsAppConnectionService, routes };
  }

  it('AC-8: POST .../pairing inicia o pareamento e devolve o QR do restaurante do operador', async () => {
    const { whatsAppConnectionService, routes } = setup();
    const json = jest.fn();

    await runOperatorChain(routes['POST /restaurants/me/whatsapp/pairing'], { restaurantId: 'r-1' }, { json });

    expect(whatsAppConnectionService.startPairing).toHaveBeenCalledWith('r-1');
    expect(json).toHaveBeenCalledWith(200, { qr: 'qr-code-data' });
  });

  it('GET .../status devolve o estado de conexão do restaurante do operador', async () => {
    const { routes } = setup({ getConnectionStatus: jest.fn().mockResolvedValue(true) });
    const json = jest.fn();

    await runOperatorChain(routes['GET /restaurants/me/whatsapp/status'], { restaurantId: 'r-1' }, { json });

    expect(json).toHaveBeenCalledWith(200, { connected: true });
  });

  it('DEL /restaurants/me/whatsapp desconecta a sessão do restaurante do operador', async () => {
    const { whatsAppConnectionService, routes } = setup();
    const send = jest.fn();

    await runOperatorChain(routes['DEL /restaurants/me/whatsapp'], { restaurantId: 'r-1' }, { send });

    expect(whatsAppConnectionService.disconnect).toHaveBeenCalledWith('r-1');
    expect(send).toHaveBeenCalledWith(204);
  });
});
