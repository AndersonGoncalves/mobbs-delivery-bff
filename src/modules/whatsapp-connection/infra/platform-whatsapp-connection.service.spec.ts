import { loadBaileys } from './load-baileys';
import { clearWhatsAppSession } from './mongo-auth-state';
import { PlatformWhatsAppConnectionService } from './platform-whatsapp-connection.service';
import { WhatsAppSessionModel } from './models/whatsapp-session.mongoose.model';

jest.mock('./load-baileys');
jest.mock('./mongo-auth-state', () => ({
  useMongoAuthState: jest.fn().mockResolvedValue({ state: { creds: {}, keys: {} }, saveCreds: jest.fn() }),
  clearWhatsAppSession: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./models/whatsapp-session.mongoose.model', () => ({
  WhatsAppSessionModel: { exists: jest.fn() },
}));

type ConnectSpy = jest.SpyInstance<Promise<void>, []>;

describe('PlatformWhatsAppConnectionService (specs/0124-campanha-whatsapp-prospects)', () => {
  function setup() {
    const service = new PlatformWhatsAppConnectionService();
    // `connect` abre um socket real do Baileys (não roda em teste) — substituído por um espião.
    const connect = jest.spyOn(service as unknown as { connect: () => Promise<void> }, 'connect') as ConnectSpy;
    return { service, connect };
  }

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('getConnectionStatus começa falso, sem nenhuma sessão aberta', async () => {
    const { service } = setup();
    await expect(service.getConnectionStatus()).resolves.toBe(false);
  });

  it('REQ-2: restoreConnectedSession reabre a sessão quando já foi pareada antes', async () => {
    const { service, connect } = setup();
    (WhatsAppSessionModel.exists as jest.Mock).mockResolvedValue({ _id: 'platform' });
    connect.mockResolvedValue(undefined);

    await service.restoreConnectedSession();

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('restoreConnectedSession não tenta conectar quando a sessão nunca foi pareada', async () => {
    const { service, connect } = setup();
    (WhatsAppSessionModel.exists as jest.Mock).mockResolvedValue(null);

    await service.restoreConnectedSession();

    expect(connect).not.toHaveBeenCalled();
  });

  it('restoreConnectedSession não lança se a reconexão falhar', async () => {
    const { service, connect } = setup();
    (WhatsAppSessionModel.exists as jest.Mock).mockResolvedValue({ _id: 'platform' });
    connect.mockRejectedValue(new Error('credenciais inválidas'));

    await expect(service.restoreConnectedSession()).resolves.toBeUndefined();
  });

  it('REQ-6/REQ-10: sendMessage lança se a sessão não estiver conectada', async () => {
    const { service } = setup();
    await expect(service.sendMessage('85986404604', 'oi')).rejects.toThrow('WhatsApp da plataforma não conectado');
  });

  it('REQ-6/REQ-10: sendImageMessage lança se a sessão não estiver conectada', async () => {
    const { service } = setup();
    await expect(service.sendImageMessage('85986404604', 'https://img', 'legenda')).rejects.toThrow(
      'WhatsApp da plataforma não conectado',
    );
  });
});

// Achado crítico da auditoria pós-merge (31/10/2026) — "listener do WhatsApp com await fora de
// try/catch", mesmo achado de `WhatsAppConnectionService`.
describe('PlatformWhatsAppConnectionService — listener do connection.update', () => {
  type Handler = (update: Record<string, unknown>) => Promise<void>;

  function setupWithRealConnect() {
    const handlers: Handler[] = [];
    const makeWASocket = jest.fn().mockImplementation(() => ({
      ev: {
        on: (event: string, handler: Handler) => {
          if (event === 'connection.update') handlers.push(handler);
        },
      },
      logout: jest.fn().mockResolvedValue(undefined),
    }));
    (loadBaileys as jest.Mock).mockResolvedValue({
      makeWASocket,
      makeCacheableSignalKeyStore: jest.fn(),
      DisconnectReason: { loggedOut: 401, restartRequired: 515 },
    });
    const service = new PlatformWhatsAppConnectionService();
    return { service, handlers };
  }

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('achado de auditoria (2026-10-31): uma falha dentro do listener é capturada, logada, e nunca propaga', async () => {
    const { service, handlers } = setupWithRealConnect();
    (WhatsAppSessionModel.exists as jest.Mock).mockResolvedValue({ _id: 'platform' });
    (clearWhatsAppSession as jest.Mock).mockRejectedValueOnce(new Error('Mongo indisponível'));
    // `restoreConnectedSession` chama `connect()` direto, sem o polling de `waitForQr()` (que
    // `startPairing()` faria, lento de verdade sem fake timers).
    await service.restoreConnectedSession();

    await expect(handlers[0]({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } })).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('falha não tratada no connection.update'), expect.any(Error));
  });
});
