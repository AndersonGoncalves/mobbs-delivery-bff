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

  describe('Entrega API (specs/0130-integracao-99-entrega)', () => {
    const pickup = { street: 'Rua A', number: '1', neighborhood: 'Centro', city: 'SP', state: 'SP', country: 'BRASIL', zipCode: '01000-000', name: 'Restaurante', phone: '11999990000' };
    const dropoff = { street: 'Rua B', number: '2', neighborhood: 'Centro', city: 'SP', state: 'SP', country: 'BRASIL', zipCode: '02000-000', name: 'Cliente' };

    it('activateEntregaService: POST /v3/entrega/authorization/register com auth_token', async () => {
      mockFetchOnce(200, { errno: 0, errmsg: 'ok', data: {} });

      await client.activateEntregaService('token-abc');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://openapi.99food.com/v3/entrega/authorization/register',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ auth_token: 'token-abc' }) }),
      );
    });

    it('estimateEntregaPrice: POST /v3/entrega/order/estimation, sempre entrega_moto', async () => {
      mockFetchOnce(200, { errno: 0, errmsg: 'ok', data: { id: 'estimate-1', fee: 600, currency: 'R$', created_time: 1, expires_time: 2, delivery_distance: 0, delivery_duration: 10 } });

      const result = await client.estimateEntregaPrice('token-abc', { pickup, dropoff });

      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.vehicle_type).toBe('entrega_moto');
      expect(body.pickup_info.structured_address.street).toBe('Rua A');
      expect(body.dropoff_info.structured_address.street).toBe('Rua B');
      expect(result).toEqual({ estimateId: 'estimate-1', fee: 600, currency: 'R$', expiresAt: 2 });
    });

    it('placeEntregaOrder: POST /v3/entrega/order/place com order_id (99Food order ID) e estimate_id', async () => {
      mockFetchOnce(200, { errno: 0, errmsg: 'ok', data: { entrega: { order_id: 'entrega-99' }, order_id: '5764687801396298500' } });

      const result = await client.placeEntregaOrder('token-abc', '5764687801396298500', 'estimate-1', { pickup, dropoff });

      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.order_id).toBe('5764687801396298500');
      expect(body.estimate_id).toBe('estimate-1');
      expect(body.package_info).toEqual({ package_type: 'food', package_weight: '5kg' });
      expect(body.pickup_info.name).toBe('Restaurante');
      expect(body.dropoff_info.phone).toBeUndefined();
      expect(result).toEqual({ entregaOrderId: 'entrega-99' });
    });

    it('getEntregaOrderDetails: GET /v3/entrega/order/detail com entrega_order_id', async () => {
      mockFetchOnce(200, {
        errno: 0,
        errmsg: 'ok',
        data: { status: 'delivering', tracking_link: 'https://t.example.com/1', driver_info: { name: 'Carlos', phone: '11988887777' } },
      });

      const result = await client.getEntregaOrderDetails('token-abc', { entregaOrderId: 'entrega-99' });

      const [url] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toContain('entrega_order_id=entrega-99');
      expect(result).toEqual({ status: 'delivering', trackingLink: 'https://t.example.com/1', courierName: 'Carlos', courierPhone: '11988887777' });
    });

    it('cancelEntregaOrder: POST /v3/entrega/order/cancel com reason_id fixo 410018', async () => {
      mockFetchOnce(200, { errno: 0, errmsg: 'ok', data: true });

      await client.cancelEntregaOrder('token-abc', { entregaOrderId: 'entrega-99' });

      const [, options] = (global.fetch as jest.Mock).mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({ auth_token: 'token-abc', entrega_order_id: 'entrega-99', reason_id: '410018' });
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
