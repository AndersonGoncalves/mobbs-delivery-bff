import { UberDirectAuthService } from './uber-direct-auth.service';

describe('UberDirectAuthService (specs/0121-integracao-uber-entregas)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('obtém o token via OAuth2 client-credentials (scope eats.deliveries)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'token-abc', expires_in: 2_592_000 }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const token = await new UberDirectAuthService().getAccessToken('client-1', 'secret-1');

    expect(token).toBe('token-abc');
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://auth.uber.com/oauth/v2/token');
    expect(options.body).toContain('scope=eats.deliveries');
    expect(options.body).toContain('grant_type=client_credentials');
  });

  it('cacheia o token em memória, sem chamar a Uber de novo antes de expirar', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'token-abc', expires_in: 2_592_000 }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new UberDirectAuthService();

    await service.getAccessToken('client-1', 'secret-1');
    await service.getAccessToken('client-1', 'secret-1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('erro da Uber (4xx/5xx) lança com o corpo da resposta', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'invalid_client' }) as unknown as typeof fetch;

    await expect(new UberDirectAuthService().getAccessToken('client-1', 'secret-errada')).rejects.toThrow('invalid_client');
  });
});
