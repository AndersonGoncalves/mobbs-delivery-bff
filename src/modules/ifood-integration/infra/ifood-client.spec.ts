import { IFoodClient } from './ifood-client';

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(body === undefined ? '' : JSON.stringify(body)),
  }) as unknown as typeof fetch;
}

describe('IFoodClient (specs/0090-integracao-ifood)', () => {
  const client = new IFoodClient('https://merchant-api.ifood.com.br');

  afterEach(() => jest.restoreAllMocks());

  it('getEvents: GET /order/v1.0/events:polling com x-polling-merchants e Bearer token', async () => {
    mockFetchOnce(200, [{ id: 'e-1', code: 'PLC', orderId: 'o-1', createdAt: '2026-10-28T00:00:00Z' }]);

    const events = await client.getEvents('token-1', 'merchant-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://merchant-api.ifood.com.br/order/v1.0/events:polling',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'x-polling-merchants': 'merchant-1', Authorization: 'Bearer token-1' }),
      }),
    );
    expect(events).toEqual([{ id: 'e-1', code: 'PLC', orderId: 'o-1', createdAt: '2026-10-28T00:00:00Z' }]);
  });

  it('getEvents: sem eventos pendentes devolve array vazio (não null)', async () => {
    mockFetchOnce(200, null);

    const events = await client.getEvents('token-1', 'merchant-1');

    expect(events).toEqual([]);
  });

  it('acknowledgeEvents: POST /order/v1.0/events/acknowledgment com os ids', async () => {
    mockFetchOnce(200, undefined);

    await client.acknowledgeEvents('token-1', ['e-1', 'e-2']);

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual([{ id: 'e-1' }, { id: 'e-2' }]);
  });

  it('acknowledgeEvents: lista vazia não chama a API', async () => {
    global.fetch = jest.fn();

    await client.acknowledgeEvents('token-1', []);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('getOrderDetails: GET /order/v1.0/orders/:id', async () => {
    const payload = { id: 'o-1', displayId: '123', orderType: 'DELIVERY', customer: { name: 'Ana' }, items: [], total: { orderAmount: { value: 50 } } };
    mockFetchOnce(200, payload);

    const result = await client.getOrderDetails('token-1', 'o-1');

    expect(global.fetch).toHaveBeenCalledWith('https://merchant-api.ifood.com.br/order/v1.0/orders/o-1', expect.objectContaining({ method: 'GET' }));
    expect(result).toEqual(payload);
  });

  it('confirmOrder: POST /order/v1.0/orders/:id/confirm', async () => {
    mockFetchOnce(200, undefined);

    await client.confirmOrder('token-1', 'o-1');

    expect(global.fetch).toHaveBeenCalledWith('https://merchant-api.ifood.com.br/order/v1.0/orders/o-1/confirm', expect.objectContaining({ method: 'POST' }));
  });

  it('requestCancellation: POST /order/v1.0/orders/:id/requestCancellation com o motivo', async () => {
    mockFetchOnce(200, undefined);

    await client.requestCancellation('token-1', 'o-1', 'Produto em falta');

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://merchant-api.ifood.com.br/order/v1.0/orders/o-1/requestCancellation');
    expect(JSON.parse(options.body)).toEqual({ reason: 'Produto em falta' });
  });

  it('lança erro claro quando a API do iFood responde com falha', async () => {
    mockFetchOnce(500, { message: 'erro interno' });

    await expect(client.getOrderDetails('token-1', 'o-1')).rejects.toThrow('500');
  });
});
