import { UberDirectClient } from './uber-direct-client';

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  }) as unknown as typeof fetch;
}

describe('UberDirectClient (specs/0121-integracao-uber-entregas)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('createQuote: POST /v1/customers/:customerId/delivery_quotes com endereços como string JSON', async () => {
    mockFetchOnce(200, { id: 'quote-1', kind: 'delivery_quote', fee: 1200, currency: 'BRL' });
    const client = new UberDirectClient();

    const quote = await client.createQuote(
      'token-1',
      'uber-customer-1',
      { streetAddress: 'Av. Central, 1', city: 'São Paulo', state: 'SP', zipCode: '01000000' },
      { streetAddress: 'Rua das Flores, 123', city: 'São Paulo', state: 'SP', zipCode: '' },
    );

    expect(quote.id).toBe('quote-1');
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.uber.com/v1/customers/uber-customer-1/delivery_quotes');
    expect(options.headers.Authorization).toBe('Bearer token-1');
    const body = JSON.parse(options.body);
    expect(JSON.parse(body.pickup_address)).toMatchObject({ city: 'São Paulo', zip_code: '01000000' });
  });

  it('createDelivery: POST /v1/customers/:customerId/deliveries com quote_id e manifest_items', async () => {
    mockFetchOnce(200, { id: 'del-1', status: 'pending', tracking_url: 'https://track.uber.com/del-1' });
    const client = new UberDirectClient();

    const delivery = await client.createDelivery('token-1', 'uber-customer-1', {
      quoteId: 'quote-1',
      pickup: { streetAddress: 'Av. Central, 1', city: 'São Paulo', state: 'SP', zipCode: '01000000' },
      pickupName: 'Prime Pizza',
      pickupPhoneNumber: '11999990000',
      dropoff: { streetAddress: 'Rua das Flores, 123', city: 'São Paulo', state: 'SP', zipCode: '' },
      dropoffName: 'João',
      dropoffPhoneNumber: '11988880000',
      manifestItems: [{ name: 'Pizza', quantity: 2 }],
    });

    expect(delivery.id).toBe('del-1');
    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.uber.com/v1/customers/uber-customer-1/deliveries');
    const body = JSON.parse(options.body);
    expect(body.quote_id).toBe('quote-1');
    expect(body.manifest_items).toEqual([{ name: 'Pizza', quantity: 2 }]);
  });

  it('erro da API (cotação recusada) lança com o corpo da resposta', async () => {
    mockFetchOnce(422, { message: 'fora da área de cobertura' });
    const client = new UberDirectClient();

    await expect(
      client.createQuote(
        'token-1',
        'uber-customer-1',
        { streetAddress: 'Av. Central, 1', city: 'São Paulo', state: 'SP', zipCode: '01000000' },
        { streetAddress: 'Rua X', city: 'São Paulo', state: 'SP', zipCode: '' },
      ),
    ).rejects.toThrow('fora da área de cobertura');
  });
});
