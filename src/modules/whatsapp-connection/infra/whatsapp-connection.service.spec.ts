import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { loadBaileys } from './load-baileys';
import { clearWhatsAppSession } from './mongo-auth-state';
import { WhatsAppConnectionService } from './whatsapp-connection.service';

jest.mock('./load-baileys');
jest.mock('./mongo-auth-state', () => ({
  useMongoAuthState: jest.fn().mockResolvedValue({ state: { creds: {}, keys: {} }, saveCreds: jest.fn() }),
  clearWhatsAppSession: jest.fn().mockResolvedValue(undefined),
}));

type ConnectSpy = jest.SpyInstance<Promise<void>, [string]>;

describe('WhatsAppConnectionService.restoreConnectedSessions (specs/0066)', () => {
  function setup(connectedIds: string[]) {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findWhatsappConnectedIds: jest.fn().mockResolvedValue(connectedIds),
    };
    const service = new WhatsAppConnectionService(restaurantRepository as IRestaurantRepository);
    // `connect` abre um socket real do Baileys (não roda em teste) — substituído por um espião.
    const connect = jest.spyOn(service as unknown as { connect: (id: string) => Promise<void> }, 'connect') as ConnectSpy;
    return { service, connect };
  }

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('AC-1: reabre a sessão de cada restaurante marcado como conectado', async () => {
    const { service, connect } = setup(['r-1', 'r-2']);
    connect.mockResolvedValue(undefined);

    await service.restoreConnectedSessions();

    expect(connect).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenCalledWith('r-1');
    expect(connect).toHaveBeenCalledWith('r-2');
  });

  it('AC-2: falha em um restaurante não impede os demais nem lança', async () => {
    const { service, connect } = setup(['r-1', 'r-2']);
    connect.mockRejectedValueOnce(new Error('credenciais inválidas')).mockResolvedValueOnce(undefined);

    await expect(service.restoreConnectedSessions()).resolves.toBeUndefined();

    expect(connect).toHaveBeenCalledWith('r-2');
  });
});

describe('WhatsAppConnectionService — quedas de conexão (specs/0067)', () => {
  const RESTART_REQUIRED = 515;
  const LOGGED_OUT = 401;
  const QR_TIMEOUT = 408;

  type Handler = (update: Record<string, unknown>) => Promise<void>;

  function setup() {
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
      DisconnectReason: { loggedOut: LOGGED_OUT, restartRequired: RESTART_REQUIRED },
    });
    const restaurantRepository: Partial<IRestaurantRepository> = {
      setWhatsappConnected: jest.fn().mockResolvedValue(undefined),
      findWhatsappConnectedIds: jest.fn().mockResolvedValue(['r-1']),
    };
    const service = new WhatsAppConnectionService(restaurantRepository as IRestaurantRepository);
    const close = (statusCode: number, handlerIndex = handlers.length - 1) =>
      handlers[handlerIndex]({ connection: 'close', lastDisconnect: { error: { output: { statusCode } } } });
    return { service, makeWASocket, handlers, restaurantRepository, close };
  }

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (clearWhatsAppSession as jest.Mock).mockClear();
  });
  afterEach(() => jest.restoreAllMocks());

  it('restartRequired (logo depois de ler o QR) abre um socket novo — sem isso o pareamento nunca completa', async () => {
    const { service, makeWASocket, close } = setup();
    await service.restoreConnectedSessions();
    expect(makeWASocket).toHaveBeenCalledTimes(1);

    await close(RESTART_REQUIRED);

    expect(makeWASocket).toHaveBeenCalledTimes(2);
  });

  it('queda de uma sessão que já estava conectada reconecta', async () => {
    const { service, makeWASocket, handlers, close } = setup();
    await service.restoreConnectedSessions();
    await handlers[0]({ connection: 'open' });

    await close(500, 0);

    expect(makeWASocket).toHaveBeenCalledTimes(2);
  });

  it('QR que expirou sem ninguém ler não reconecta (evita loop infinito) e marca desconectado', async () => {
    const { service, makeWASocket, restaurantRepository, close } = setup();
    await service.restoreConnectedSessions();

    await close(QR_TIMEOUT);

    expect(makeWASocket).toHaveBeenCalledTimes(1);
    expect(restaurantRepository.setWhatsappConnected).toHaveBeenCalledWith('r-1', false);
  });

  it('logout pelo celular limpa a sessão persistida e não reconecta', async () => {
    const { service, makeWASocket, restaurantRepository, close } = setup();
    await service.restoreConnectedSessions();

    await close(LOGGED_OUT);

    expect(makeWASocket).toHaveBeenCalledTimes(1);
    expect(clearWhatsAppSession).toHaveBeenCalledWith('r-1');
    expect(restaurantRepository.setWhatsappConnected).toHaveBeenCalledWith('r-1', false);
  });
});
