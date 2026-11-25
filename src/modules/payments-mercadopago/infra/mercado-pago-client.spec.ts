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
      // specs/0226 AC-A2 — checkout de cartão sem Pix (bank_transfer) nem boleto (ticket).
      payment_methods: { excluded_payment_types: [{ id: 'bank_transfer' }, { id: 'ticket' }] },
    });
    expect(result).toEqual({ id: 'pref-1', initPoint: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=pref-1' });
  });

  it('getPayment: GET /v1/payments/:id devolve id do pagamento, status e external_reference', async () => {
    mockFetchOnce(200, { id: 1234567890, status: 'approved', external_reference: 'o-1', payment_method_id: 'visa' });

    const result = await client.getPayment('app-access-token', 'pay-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/payments/pay-1',
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer app-access-token' }) }),
    );
    // specs/0226 REQ-A3 — id do PAGAMENTO (número no Mercado Pago, devolvido como string).
    expect(result).toEqual({ id: '1234567890', status: 'approved', externalReference: 'o-1', paymentMethodId: 'visa' });
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

  it('specs/0226 REQ-B1: exchangeCodeForToken com testToken envia test_token: true (token de sandbox)', async () => {
    mockFetchOnce(200, { access_token: 'TEST-token', refresh_token: 'r', user_id: 1, expires_in: 1 });
    await client.exchangeCodeForToken('code', 'https://hml.bsdelivery.com.br/cb', undefined, true);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toMatchObject({ test_token: true });
  });

  it('specs/0226 REQ-B1: sem testToken (produção) não envia test_token', async () => {
    mockFetchOnce(200, { access_token: 'APP_USR-token', refresh_token: 'r', user_id: 1, expires_in: 1 });
    await client.exchangeCodeForToken('code', 'https://bsdelivery.com.br/cb');
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).not.toHaveProperty('test_token');
  });

  it('specs/0226 REQ-B1: createPixOrder faz POST /v1/orders com o token do restaurante, valores em string, 30 min e X-Idempotency-Key', async () => {
    mockFetchOnce(201, {
      id: 'ORD01ABC',
      status: 'action_required',
      transactions: { payments: [{ id: 'PAY01', payment_method: { id: 'pix', qr_code: '00020101...copia-e-cola', qr_code_base64: 'iVBOR' } }] },
    });

    const result = await client.createPixOrder('restaurante-token', {
      orderId: 'o-1', amount: 58, payerEmail: 'ana@exemplo.com', payerFirstName: 'Ana', expirationTime: 'PT30M', idempotencyKey: 'pix-o-1',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/orders',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer restaurante-token', 'X-Idempotency-Key': 'pix-o-1' }),
      }),
    );
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      type: 'online',
      processing_mode: 'automatic',
      total_amount: '58.00',
      external_reference: 'o-1',
      payer: { email: 'ana@exemplo.com', first_name: 'Ana' },
      transactions: { payments: [{ amount: '58.00', payment_method: { id: 'pix', type: 'bank_transfer' }, expiration_time: 'PT30M' }] },
    });
    expect(result).toEqual({ id: 'ORD01ABC', status: 'action_required', qrCode: '00020101...copia-e-cola' });
  });

  it('specs/0226 REQ-B1: createPixOrder sem qr_code na resposta lança erro (o pedido cai na chave manual)', async () => {
    mockFetchOnce(201, { id: 'ORD01ABC', status: 'failed', transactions: { payments: [{ payment_method: { id: 'pix' } }] } });
    await expect(
      client.createPixOrder('t', { orderId: 'o-1', amount: 10, payerEmail: 'a@b.com', expirationTime: 'PT30M', idempotencyKey: 'k' }),
    ).rejects.toThrow(/código Pix/);
  });

  it('specs/0226 REQ-B3: getOrder faz GET /v1/orders/:id e devolve status e external_reference', async () => {
    mockFetchOnce(200, { id: 'ORD01ABC', status: 'processed', status_detail: 'accredited', external_reference: 'o-1' });
    const result = await client.getOrder('restaurante-token', 'ORD01ABC');
    expect(global.fetch).toHaveBeenCalledWith('https://api.mercadopago.com/v1/orders/ORD01ABC', expect.objectContaining({ method: 'GET' }));
    expect(result).toEqual({ id: 'ORD01ABC', status: 'processed', statusDetail: 'accredited', externalReference: 'o-1' });
  });

  it('specs/0226 REQ-B4/REQ-B5: refundOrder e cancelOrder fazem POST com X-Idempotency-Key', async () => {
    mockFetchOnce(201, { status: 'refunded' });
    await client.refundOrder('restaurante-token', 'ORD01ABC');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/orders/ORD01ABC/refund',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-Idempotency-Key': 'refund-ORD01ABC' }) }),
    );

    mockFetchOnce(200, { status: 'canceled' });
    await client.cancelOrder('restaurante-token', 'ORD01ABC');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.mercadopago.com/v1/orders/ORD01ABC/cancel',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'X-Idempotency-Key': 'cancel-ORD01ABC' }) }),
    );
  });
});
