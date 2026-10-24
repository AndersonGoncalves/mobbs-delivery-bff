import { MercadoPagoClient } from './mercado-pago-client';

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  }) as unknown as typeof fetch;
}

describe('MercadoPagoClient (specs/0170-integracao-mercado-pago)', () => {
  const client = new MercadoPagoClient('app-client-id', 'app-client-secret', 'https://api.mercadopago.com');

  afterEach(() => jest.restoreAllMocks());

  it('getAuthorizationUrl: monta a URL de autorização OAuth com client_id, state e redirect_uri', () => {
    const url = client.getAuthorizationUrl('https://bsdelivery.com.br/painel/mercadopago/callback', 'nonce-1');

    expect(url).toBe(
      'https://auth.mercadopago.com/authorization?client_id=app-client-id&response_type=code&platform_id=mp&state=nonce-1&redirect_uri=https%3A%2F%2Fbsdelivery.com.br%2Fpainel%2Fmercadopago%2Fcallback',
    );
  });

  it('exchangeCodeForToken: POST /oauth/token com grant_type authorization_code', async () => {
    mockFetchOnce(200, { access_token: 'token-1', refresh_token: 'refresh-1', user_id: 123, expires_in: 15552000 });

    const result = await client.exchangeCodeForToken('code-1', 'https://bsdelivery.com.br/painel/mercadopago/callback');

    expect(global.fetch).toHaveBeenCalledWith('https://api.mercadopago.com/oauth/token', expect.objectContaining({ method: 'POST' }));
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      client_id: 'app-client-id',
      client_secret: 'app-client-secret',
      code: 'code-1',
      grant_type: 'authorization_code',
      redirect_uri: 'https://bsdelivery.com.br/painel/mercadopago/callback',
    });
    expect(result).toEqual({ accessToken: 'token-1', refreshToken: 'refresh-1', userId: '123', expiresIn: 15552000 });
  });

  it('refreshAccessToken: POST /oauth/token com grant_type refresh_token', async () => {
    mockFetchOnce(200, { access_token: 'token-2', refresh_token: 'refresh-2', user_id: 123, expires_in: 15552000 });

    const result = await client.refreshAccessToken('refresh-1');

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      client_id: 'app-client-id',
      client_secret: 'app-client-secret',
      grant_type: 'refresh_token',
      refresh_token: 'refresh-1',
    });

    expect(result).toEqual({ accessToken: 'token-2', refreshToken: 'refresh-2', userId: '123', expiresIn: 15552000 });
  });

  it('0180: envia code_verifier quando PKCE foi usado', async () => {
    mockFetchOnce(200, { access_token: 'token', refresh_token: 'refresh', user_id: 123, expires_in: 3600 });
    await client.exchangeCodeForToken('code', 'https://bsdelivery.com.br/painel/settings/mercadopago/callback', 'v'.repeat(64));
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toMatchObject({ code_verifier: 'v'.repeat(64) });
  });

  it('createPreference: POST /checkout/preferences com o accessToken do restaurante e external_reference', async () => {
    mockFetchOnce(200, { id: 'pref-1', init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1' });

    const result = await client.createPreference('restaurante-token', {
      orderId: 'o-1',
      items: [{ title: 'Pedido #1', quantity: 1, unitPrice: 50 }],
      notificationUrl: 'https://api.bsdelivery.com.br/webhooks/mercadopago',
      backUrls: { success: 'https://bsdelivery.com.br/r/o-1', failure: 'https://bsdelivery.com.br/r/o-1', pending: 'https://bsdelivery.com.br/r/o-1' },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.mercadopago.com/checkout/preferences',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer restaurante-token' }) }),
    );
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toMatchObject({
      items: [{ title: 'Pedido #1', quantity: 1, unit_price: 50, currency_id: 'BRL' }],
      external_reference: 'o-1',
      notification_url: 'https://api.bsdelivery.com.br/webhooks/mercadopago',
      auto_return: 'all',
    });
    expect(result).toEqual({ id: 'pref-1', initPoint: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1' });
  });

  it('getPayment: GET /v1/payments/:id devolve status e external_reference', async () => {
    mockFetchOnce(200, { status: 'approved', external_reference: 'o-1' });

    const result = await client.getPayment('app-access-token', 'pay-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/payments/pay-1',
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer app-access-token' }) }),
    );
    expect(result).toEqual({ status: 'approved', externalReference: 'o-1' });
  });

  it('refundPayment: POST /v1/payments/:id/refunds sem corpo (estorno total)', async () => {
    mockFetchOnce(200, { status: 'refunded' });

    await client.refundPayment('restaurante-token', 'pay-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/payments/pay-1/refunds',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer restaurante-token' }) }),
    );
  });

  it('lança erro com status e corpo quando a API responde com erro', async () => {
    mockFetchOnce(400, { message: 'invalid_token' });

    await expect(client.getPayment('token-invalido', 'pay-1')).rejects.toThrow(/400/);
  });
});
