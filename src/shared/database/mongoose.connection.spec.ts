const connect = jest.fn().mockResolvedValue(undefined);
const on = jest.fn();

jest.mock('mongoose', () => ({
  __esModule: true,
  default: { connect: (...args: unknown[]) => connect(...args), connection: { on: (...args: unknown[]) => on(...args) } },
}));

jest.mock('../config/environment', () => ({ environment: { db: { url: 'mongodb://localhost:27017/test' } } }));

// Achado de auditoria (06/11/2026) — sem timeout explícito, uma queda do Mongo deixava
// requisições penduradas por ~30s (default do driver) sem nenhum log avisando.
describe('MongooseConnection', () => {
  // `MongooseConnection` é singleton por módulo (`static instance`) — sem resetar o registro de
  // módulos do Jest, o segundo teste em diante herdaria a instância (e o `listenersRegistered`)
  // do teste anterior.
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('conecta com serverSelectionTimeoutMS/socketTimeoutMS explícitos', async () => {
    const { MongooseConnection } = await import('./mongoose.connection');

    await MongooseConnection.getInstance().connect();

    expect(connect).toHaveBeenCalledWith('mongodb://localhost:27017/test', expect.objectContaining({
      serverSelectionTimeoutMS: expect.any(Number),
      socketTimeoutMS: expect.any(Number),
    }));
  });

  it('registra listeners de error/disconnected/reconnected na conexão', async () => {
    const { MongooseConnection } = await import('./mongoose.connection');

    await MongooseConnection.getInstance().connect();

    expect(on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(on).toHaveBeenCalledWith('disconnected', expect.any(Function));
    expect(on).toHaveBeenCalledWith('reconnected', expect.any(Function));
  });

  it('não registra os listeners de novo numa segunda chamada (instância é singleton)', async () => {
    const { MongooseConnection } = await import('./mongoose.connection');

    await MongooseConnection.getInstance().connect();
    await MongooseConnection.getInstance().connect();

    expect(on).toHaveBeenCalledTimes(3);
  });

  it('loga via console.error quando a conexão emite "error"', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { MongooseConnection } = await import('./mongoose.connection');
    await MongooseConnection.getInstance().connect();
    const errorHandler = on.mock.calls.find(([event]) => event === 'error')?.[1] as (error: unknown) => void;

    errorHandler(new Error('falha de rede'));

    expect(consoleError).toHaveBeenCalledWith('[mongo] erro na conexão:', expect.any(Error));
    consoleError.mockRestore();
  });
});
