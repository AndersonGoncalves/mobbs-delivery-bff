import { NinetyNineFoodClient } from './ninety-nine-food-client';

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(body === undefined ? '' : JSON.stringify(body)),
  }) as unknown as typeof fetch;
}

describe('NinetyNineFoodClient (specs/0122-integracao-99food)', () => {
  const client = new NinetyNineFoodClient('https://openapi.99food.com');

  afterEach(() => jest.restoreAllMocks());

  it('getAuthorizationUrl: POST /v1/auth/authorizationpage/getUrl com app_id', async () => {
    mockFetchOnce(200, { errno: 0, errmsg: 'OK', data: { url: 'https://merchant.99app.com/authorize?x=1' } });

    const url = await client.getAuthorizationUrl('app-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://openapi.99food.com/v1/auth/authorizationpage/getUrl',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ app_id: 'app-1' }) }),
    );
    expect(url).toBe('https://merchant.99app.com/authorize?x=1');
  });

  it('getAuthtoken: GET /v1/auth/authtoken/get com app_id/app_secret/app_shop_id na query', async () => {
    mockFetchOnce(200, { errno: 0, errmsg: 'ok', data: { auth_token: 'token-abc', token_expiration_time: 1700000000 } });

    const result = await client.getAuthtoken('app-1', 'secret-1', 'shop-1');

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://openapi.99food.com/v1/auth/authtoken/get?app_id=app-1&app_secret=secret-1&app_shop_id=shop-1');
    expect(options.method).toBe('GET');
    expect(result).toEqual({ authToken: 'token-abc', tokenExpirationTime: 1700000000 });
  });

  it('refreshAuthtoken: GET /v1/auth/authtoken/refresh', async () => {
    mockFetchOnce(200, { errno: 0, errmsg: 'ok', data: true });

    await client.refreshAuthtoken('app-1', 'secret-1', 'shop-1');

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/v1/auth/authtoken/refresh?');
  });

  it('confirmOrder: POST /v1/order/order/confirm com auth_token/order_id (order_id como string)', async () => {
    mockFetchOnce(200, { errno: 0, errmsg: 'ok', data: true });

    await client.confirmOrder('token-abc', '5764656197621845665');

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://openapi.99food.com/v1/order/order/confirm');
    expect(JSON.parse(options.body)).toEqual({ auth_token: 'token-abc', order_id: '5764656197621845665' });
  });

  it('cancelOrder: POST /v1/order/order/cancel com reason_id e reason opcional', async () => {
    mockFetchOnce(200, { errno: 0, errmsg: 'ok', data: true });

    await client.cancelOrder('token-abc', '5764656197621845665', 1080, 'cliente desistiu');

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      auth_token: 'token-abc',
      order_id: '5764656197621845665',
      reason_id: '1080',
      reason: 'cliente desistiu',
    });
  });

  it('lança erro quando a resposta HTTP não é ok', async () => {
    mockFetchOnce(500, undefined);

    await expect(client.confirmOrder('token-abc', '1')).rejects.toThrow(/HTTP 500/);
  });

  it('lança erro quando errno !== 0 (sucesso HTTP, falha de negócio)', async () => {
    mockFetchOnce(200, { errno: 10102, errmsg: 'auth_token has expired', data: null });

    await expect(client.confirmOrder('token-abc', '1')).rejects.toThrow(/errno 10102/);
  });
});
