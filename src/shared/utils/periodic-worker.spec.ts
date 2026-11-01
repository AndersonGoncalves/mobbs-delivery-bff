import { startPeriodicWorker } from './periodic-worker';

// Achado de auditoria pré-produção (31/10/2026) — "workers periódicos sem guarda contra
// execução concorrente".
describe('startPeriodicWorker (achado de auditoria 2026-10-31)', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('ignora um tick que chega enquanto o anterior ainda está em andamento (nunca dispara em paralelo)', async () => {
    let resolveFirst!: () => void;
    const run = jest.fn().mockReturnValueOnce(new Promise<void>((resolve) => { resolveFirst = resolve; })).mockResolvedValue(undefined);

    startPeriodicWorker('worker-teste', 1000, run);

    jest.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);

    // Tick seguinte chega antes do primeiro `run()` ter resolvido — deve ser ignorado.
    jest.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(1);

    resolveFirst();
    await Promise.resolve();
    await Promise.resolve();

    // Agora que o primeiro terminou, o próximo tick já dispara normalmente.
    jest.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('um run() rejeitado não derruba o worker — o próximo tick ainda dispara normalmente', async () => {
    const run = jest.fn().mockRejectedValueOnce(new Error('falha externa')).mockResolvedValue(undefined);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    startPeriodicWorker('worker-teste', 1000, run);

    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(consoleError).toHaveBeenCalledWith('[worker-teste] erro inesperado:', expect.any(Error));

    jest.advanceTimersByTime(1000);
    expect(run).toHaveBeenCalledTimes(2);

    consoleError.mockRestore();
  });
});
