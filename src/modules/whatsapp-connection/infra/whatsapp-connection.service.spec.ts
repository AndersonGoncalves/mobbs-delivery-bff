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

// Achado de auditoria (2026-10-31, crítico) — reconectar sem nenhum atraso, em loop, era um
// risco real de banimento do número (bater repetidamente nos servidores do WhatsApp) e de
// sobrecarregar o processo. Describe próprio com fake timers — os testes acima (sem fake timers)
// continuam esperando o primeiro atraso real (2s, tolerável); aqui precisamos avançar por vários
// atrasos crescentes, o que levaria dezenas de segundos reais sem timers falsos.
describe('WhatsAppConnectionService — backoff de reconexão (achado de auditoria 2026-10-31)', () => {
  type Handler = (update: Record<string, unknown>) => Promise<void>;
  const RESTART_REQUIRED = 515;

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
      DisconnectReason: { loggedOut: 401, restartRequired: RESTART_REQUIRED },
    });
    const restaurantRepository: Partial<IRestaurantRepository> = {
      setWhatsappConnected: jest.fn().mockResolvedValue(undefined),
      findWhatsappConnectedIds: jest.fn().mockResolvedValue(['r-1']),
    };
    const service = new WhatsAppConnectionService(restaurantRepository as IRestaurantRepository);
    // Dispara o handler (await real, sem travar) e devolve a promise ainda pendente no
    // `setTimeout` do backoff — quem chama avança o fake timer e só depois aguarda.
    const closeLatest = (statusCode: number) => handlers[handlers.length - 1]({ connection: 'close', lastDisconnect: { error: { output: { statusCode } } } });

    return { service, makeWASocket, handlers, closeLatest };
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('espera 2s antes da primeira tentativa de reconexão', async () => {
    const { service, makeWASocket, closeLatest } = setup();
    await service.restoreConnectedSessions();
    expect(makeWASocket).toHaveBeenCalledTimes(1);

    const pending = closeLatest(RESTART_REQUIRED);
    expect(makeWASocket).toHaveBeenCalledTimes(1); // ainda não reconectou — está esperando o atraso

    await jest.advanceTimersByTimeAsync(2_000);
    await pending;

    expect(makeWASocket).toHaveBeenCalledTimes(2);
  });

  it('atraso cresce exponencialmente a cada queda consecutiva (2s, 4s, 8s)', async () => {
    const { service, makeWASocket, closeLatest } = setup();
    await service.restoreConnectedSessions();

    const first = closeLatest(RESTART_REQUIRED);
    await jest.advanceTimersByTimeAsync(2_000);
    await first;
    expect(makeWASocket).toHaveBeenCalledTimes(2);

    const second = closeLatest(RESTART_REQUIRED);
    await jest.advanceTimersByTimeAsync(3_999);
    expect(makeWASocket).toHaveBeenCalledTimes(2); // 4s ainda não passou — não reconectou cedo
    await jest.advanceTimersByTimeAsync(1);
    await second;
    expect(makeWASocket).toHaveBeenCalledTimes(3);

    const third = closeLatest(RESTART_REQUIRED);
    await jest.advanceTimersByTimeAsync(7_999);
    expect(makeWASocket).toHaveBeenCalledTimes(3); // 8s ainda não passou
    await jest.advanceTimersByTimeAsync(1);
    await third;
    expect(makeWASocket).toHaveBeenCalledTimes(4);
  });

  it('atraso tem teto de 2 minutos, não cresce pra sempre', async () => {
    const { service, makeWASocket, closeLatest } = setup();
    await service.restoreConnectedSessions();

    // 2s, 4s, 8s, 16s, 32s, 64s, 128s (> teto de 120s, já deve ter sido limitado a 120s) — 7 quedas.
    for (let i = 0; i < 7; i += 1) {
      const pending = closeLatest(RESTART_REQUIRED);
      await jest.advanceTimersByTimeAsync(120_000);
      await pending;
    }
    expect(makeWASocket).toHaveBeenCalledTimes(8); // 1 inicial + 7 reconexões

    // Mais uma: se o teto estivesse sendo ignorado, o atraso já passaria de 120s — confirma que
    // 120s ainda é suficiente mesmo depois de várias quedas consecutivas.
    const eighth = closeLatest(RESTART_REQUIRED);
    await jest.advanceTimersByTimeAsync(120_000);
    await eighth;
    expect(makeWASocket).toHaveBeenCalledTimes(9);
  });

  it('conexão aberta com sucesso zera o contador — a próxima queda volta a esperar só 2s', async () => {
    const { service, makeWASocket, handlers, closeLatest } = setup();
    await service.restoreConnectedSessions();

    const first = closeLatest(RESTART_REQUIRED);
    await jest.advanceTimersByTimeAsync(2_000);
    await first;
    expect(makeWASocket).toHaveBeenCalledTimes(2);

    // Conecta de verdade — zera o contador de tentativas consecutivas.
    await handlers[handlers.length - 1]({ connection: 'open' });

    const second = closeLatest(RESTART_REQUIRED);
    await jest.advanceTimersByTimeAsync(1_999);
    expect(makeWASocket).toHaveBeenCalledTimes(2); // ainda não passaram os 2s (não os 4s de antes)
    await jest.advanceTimersByTimeAsync(1);
    await second;
    expect(makeWASocket).toHaveBeenCalledTimes(3);
  });
});

describe('WhatsAppConnectionService.sendMessage — resolve o JID real (specs/0068)', () => {
  type Handler = (update: Record<string, unknown>) => Promise<void>;

  async function setupConnected(onWhatsApp: jest.Mock) {
    let handler: Handler = async () => undefined;
    const socket = {
      ev: {
        on: (event: string, h: Handler) => {
          if (event === 'connection.update') handler = h;
        },
      },
      logout: jest.fn(),
      onWhatsApp,
      sendMessage: jest.fn().mockResolvedValue(undefined),
    };
    (loadBaileys as jest.Mock).mockResolvedValue({
      makeWASocket: jest.fn().mockReturnValue(socket),
      makeCacheableSignalKeyStore: jest.fn(),
      DisconnectReason: { loggedOut: 401, restartRequired: 515 },
    });
    const restaurantRepository: Partial<IRestaurantRepository> = {
      setWhatsappConnected: jest.fn().mockResolvedValue(undefined),
      findWhatsappConnectedIds: jest.fn().mockResolvedValue(['r-1']),
    };
    const service = new WhatsAppConnectionService(restaurantRepository as IRestaurantRepository);
    await service.restoreConnectedSessions();
    await handler({ connection: 'open' });
    return { service, socket };
  }

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('envia pro JID que o WhatsApp confirma existir (conta antiga sem o nono dígito)', async () => {
    const onWhatsApp = jest.fn().mockResolvedValue([
      { jid: '5585984224877@s.whatsapp.net', exists: false },
      { jid: '558584224877@s.whatsapp.net', exists: true },
    ]);
    const { service, socket } = await setupConnected(onWhatsApp);

    await service.sendMessage('r-1', '85984224877', 'oi');

    expect(onWhatsApp).toHaveBeenCalledWith('5585984224877@s.whatsapp.net', '558584224877@s.whatsapp.net');
    expect(socket.sendMessage).toHaveBeenCalledWith('558584224877@s.whatsapp.net', { text: 'oi' });
  });

  it('número que não existe no WhatsApp lança (o erro aparece no log, não some em silêncio)', async () => {
    const onWhatsApp = jest.fn().mockResolvedValue([
      { jid: '5585984224877@s.whatsapp.net', exists: false },
      { jid: '558584224877@s.whatsapp.net', exists: false },
    ]);
    const { service, socket } = await setupConnected(onWhatsApp);

    await expect(service.sendMessage('r-1', '85984224877', 'oi')).rejects.toThrow('não está registrado no WhatsApp');
    expect(socket.sendMessage).not.toHaveBeenCalled();
  });

  it('se a consulta onWhatsApp falhar, envia pro JID padrão em vez de travar', async () => {
    const { service, socket } = await setupConnected(jest.fn().mockRejectedValue(new Error('timeout')));

    await service.sendMessage('r-1', '85984224877', 'oi');

    expect(socket.sendMessage).toHaveBeenCalledWith('5585984224877@s.whatsapp.net', { text: 'oi' });
  });

  // specs/0092-campanha-whatsapp-clientes — mesma resolução de JID, payload de mídia em vez de texto.
  it('sendImageMessage monta o payload { image, caption } certo', async () => {
    const onWhatsApp = jest.fn().mockResolvedValue([{ jid: '5585984224877@s.whatsapp.net', exists: true }]);
    const { service, socket } = await setupConnected(onWhatsApp);

    await service.sendImageMessage('r-1', '85984224877', 'https://s3.example.com/campaign.jpg', 'Promoção especial!');

    expect(socket.sendMessage).toHaveBeenCalledWith('5585984224877@s.whatsapp.net', {
      image: { url: 'https://s3.example.com/campaign.jpg' },
      caption: 'Promoção especial!',
    });
  });
});
