import { fetchWithTimeout } from './fetch-with-timeout';

// Achado crítico da auditoria de performance pré-produção (31/10/2026) — "chamadas a
// integrações externas sem timeout".
describe('fetchWithTimeout', () => {
  afterEach(() => jest.restoreAllMocks());

  it('repassa a requisição pro fetch nativo, com um AbortSignal anexado', async () => {
    const response = { ok: true } as Response;
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(response);

    const result = await fetchWithTimeout('https://example.com', { method: 'POST' });

    expect(result).toBe(response);
    expect(fetchSpy).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ method: 'POST', signal: expect.anything() }));
  });

  it('respeita um AbortSignal já fornecido pelo chamador, em vez de sobrescrever', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    const controller = new AbortController();

    await fetchWithTimeout('https://example.com', { signal: controller.signal });

    expect(fetchSpy).toHaveBeenCalledWith('https://example.com', expect.objectContaining({ signal: controller.signal }));
  });

  it('a requisição é abortada quando o timeout (curto, de propósito) expira antes do fetch responder', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          (init?.signal as AbortSignal)?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    await expect(fetchWithTimeout('https://example.com', {}, 10)).rejects.toThrow();
  });
});
