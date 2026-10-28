import { IFoodAuthService } from './ifood-auth.service';

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  }) as unknown as typeof fetch;
}

describe('IFoodAuthService (specs/0090-integracao-ifood REQ-1)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('busca um token novo via POST /authentication/v1.0/oauth/token', async () => {
    mockFetchOnce(200, { accessToken: 'token-1', expiresIn: 3600 });
    const service = new IFoodAuthService('https://merchant-api.ifood.com.br');

    const token = await service.getAccessToken('client-1', 'secret-1');

    expect(token).toBe('token-1');
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token');
    expect(options.method).toBe('POST');
    expect(options.body).toContain('grantType=client_credentials');
    expect(options.body).toContain('clientId=client-1');
  });

  it('reaproveita o token em cache enquanto não está perto de expirar (AC-1)', async () => {
    mockFetchOnce(200, { accessToken: 'token-1', expiresIn: 3600 });
    const service = new IFoodAuthService('https://merchant-api.ifood.com.br');

    await service.getAccessToken('client-1', 'secret-1');
    const token = await service.getAccessToken('client-1', 'secret-1');

    expect(token).toBe('token-1');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('renova o token quando o cache já expirou (AC-1)', async () => {
    mockFetchOnce(200, { accessToken: 'token-1', expiresIn: 1 });
    const service = new IFoodAuthService('https://merchant-api.ifood.com.br');
    await service.getAccessToken('client-1', 'secret-1');

    mockFetchOnce(200, { accessToken: 'token-2', expiresIn: 3600 });
    const token = await service.getAccessToken('client-1', 'secret-1');

    expect(token).toBe('token-2');
  });

  it('lança erro claro quando o iFood responde com falha', async () => {
    mockFetchOnce(401, { message: 'credenciais inválidas' });
    const service = new IFoodAuthService('https://merchant-api.ifood.com.br');

    await expect(service.getAccessToken('client-1', 'secret-errada')).rejects.toThrow('401');
  });
});
