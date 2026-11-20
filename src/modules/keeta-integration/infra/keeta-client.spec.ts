import { KeetaClient } from './keeta-client';

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(body === undefined ? '' : JSON.stringify(body)),
  }) as unknown as typeof fetch;
}

describe('KeetaClient (specs/0212-integracao-keeta)', () => {
  const client = new KeetaClient('https://open.mykeeta.com', 'segredo-app');

  afterEach(() => jest.restoreAllMocks());

  it('exchangeAuthorizationCode: POST /base/oauth/token com grantType authorization_code e sig', async () => {
    mockFetchOnce(200, { code: 0, message: 'ok', data: { access_token: 'tok-1', refresh_token: 'ref-1', expires_in: 7776000 } });

    const result = await client.exchangeAuthorizationCode('app-1', 'code-xyz', 'https://api.bsdelivery.com.br/webhooks/keeta/oauth-callback');

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://open.mykeeta.com/base/oauth/token');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body.grantType).toBe('authorization_code');
    expect(body.appId).toBe('app-1');
    expect(body.code).toBe('code-xyz');
    expect(body.sig).toMatch(/^[0-9a-f]{64}$/);
    expect(result).toEqual({ accessToken: 'tok-1', refreshToken: 'ref-1', expiresIn: 7776000 });
  });

  it('refreshAccessToken: POST /base/oauth/token com grantType refresh_token', async () => {
    mockFetchOnce(200, { code: 0, message: 'ok', data: { access_token: 'tok-2', refresh_token: 'ref-2', expires_in: 7776000 } });

    await client.refreshAccessToken('app-1', 'ref-old');

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body.grantType).toBe('refresh_token');
    expect(body.refreshToken).toBe('ref-old');
  });

  it('getAuthorizedShops: POST /base/authorized/resource/get devolve brandId e lojas', async () => {
    mockFetchOnce(200, { code: 0, message: 'ok', data: { brandId: 'brand-1', authorizedShops: [{ id: 'shop-1', name: 'Loja Centro' }] } });

    const result = await client.getAuthorizedShops('app-1', 'tok-1');

    expect(result).toEqual({ brandId: 'brand-1', shops: [{ id: 'shop-1', name: 'Loja Centro' }] });
  });

  it('confirmOrder: POST /order/confirm com accessToken/shopId/orderViewId', async () => {
    mockFetchOnce(200, { code: 0, message: 'ok', data: {} });

    await client.confirmOrder('tok-1', 'shop-1', 'order-1');

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://open.mykeeta.com/order/confirm');
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ accessToken: 'tok-1', shopId: 'shop-1', orderViewId: 'order-1' });
  });

  it('cancelOrder: POST /order/cancel com cancelCode e cancelReason opcional', async () => {
    mockFetchOnce(200, { code: 0, message: 'ok', data: {} });

    await client.cancelOrder('tok-1', 'shop-1', 'order-1', '500000', 'Produto em falta');

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ cancelCode: '500000', cancelReason: 'Produto em falta' });
  });

  it('markReadyForPickup: POST /order/prepare', async () => {
    mockFetchOnce(200, { code: 0, message: 'ok', data: {} });

    await client.markReadyForPickup('tok-1', 'shop-1', 'order-1');

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://open.mykeeta.com/order/prepare');
  });

  it('lança erro com o texto do code quando a API responde code diferente de 0', async () => {
    mockFetchOnce(200, { code: 1001, message: 'Invalid signature', data: null });

    await expect(client.confirmOrder('tok-1', 'shop-1', 'order-1')).rejects.toThrow('code 1001');
  });

  it('lança erro quando a resposta HTTP não é ok', async () => {
    mockFetchOnce(500, undefined);

    await expect(client.confirmOrder('tok-1', 'shop-1', 'order-1')).rejects.toThrow('HTTP 500');
  });
});
