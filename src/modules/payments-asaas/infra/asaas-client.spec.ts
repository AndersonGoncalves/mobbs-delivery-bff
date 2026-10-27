import { AsaasClient } from './asaas-client';

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  }) as unknown as typeof fetch;
}

describe('AsaasClient (specs/0101-integracao-asaas, fase 1)', () => {
  const client = new AsaasClient('key-1', 'https://api-sandbox.asaas.com/v3');

  afterEach(() => jest.restoreAllMocks());

  it('createSubaccount: POST /accounts com webhook embutido, devolve apiKey da subconta', async () => {
    mockFetchOnce(200, { id: 'acc_1', walletId: 'wallet_1', accessToken: { apiKey: 'key-subconta' } });

    const result = await client.createSubaccount(
      { name: 'Prime Pizza', email: 'contato@primepizza.com', cpfCnpj: '12345678000190', birthDate: '1980-01-19', mobilePhone: '11999999999', incomeValue: 5000, address: 'Rua A', addressNumber: '10', province: 'Centro', postalCode: '01000000' },
      'https://api.bsdelivery.com.br/webhooks/asaas/r-1',
      'webhook-token-1',
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api-sandbox.asaas.com/v3/accounts',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ access_token: 'key-1' }),
      }),
    );
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const sentBody = JSON.parse(options.body);
    // Achado real (pedido explícito do usuário) — birthDate precisa chegar no Asaas intacto
    // (exigido por eles pra pessoa física, ver comentário em `asaas-client.ts`).
    expect(sentBody.birthDate).toBe('1980-01-19');
    expect(sentBody.webhooks[0]).toMatchObject({ url: 'https://api.bsdelivery.com.br/webhooks/asaas/r-1', authToken: 'webhook-token-1', events: ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'] });
    expect(result).toEqual({ id: 'acc_1', walletId: 'wallet_1', apiKey: 'key-subconta' });
  });

  it('createCustomer: POST /customers com name e cpfCnpj', async () => {
    mockFetchOnce(200, { id: 'cus_1' });

    const result = await client.createCustomer('Ana', '12345678900');

    expect(global.fetch).toHaveBeenCalledWith('https://api-sandbox.asaas.com/v3/customers', expect.objectContaining({ method: 'POST' }));
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ name: 'Ana', cpfCnpj: '12345678900' });
    expect(result).toEqual({ id: 'cus_1' });
  });

  it('createPixCharge: POST /payments com billingType PIX e externalReference', async () => {
    mockFetchOnce(200, { id: 'pay_1', status: 'PENDING' });

    const result = await client.createPixCharge('cus_1', 30, '2026-10-22', 'o-1');

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ customer: 'cus_1', billingType: 'PIX', value: 30, dueDate: '2026-10-22', externalReference: 'o-1' });
    expect(result).toEqual({ id: 'pay_1', status: 'PENDING' });
  });

  it('getPixQrCode: GET /payments/:id/pixQrCode devolve só o payload', async () => {
    mockFetchOnce(200, { payload: '00020126...copia-e-cola', encodedImage: 'base64...', expirationDate: '2026-10-23 23:59:59' });

    const result = await client.getPixQrCode('pay_1');

    expect(global.fetch).toHaveBeenCalledWith('https://api-sandbox.asaas.com/v3/payments/pay_1/pixQrCode', expect.objectContaining({ method: 'GET' }));
    expect(result).toEqual({ payload: '00020126...copia-e-cola' });
  });

  it('refundCharge: POST /payments/:id/refund sem corpo (estorno total)', async () => {
    mockFetchOnce(200, { status: 'PENDING' });

    await client.refundCharge('pay_1');

    expect(global.fetch).toHaveBeenCalledWith('https://api-sandbox.asaas.com/v3/payments/pay_1/refund', expect.objectContaining({ method: 'POST' }));
  });

  it('lança erro com status e corpo quando a API responde com erro', async () => {
    mockFetchOnce(400, { errors: [{ code: 'invalid_cpfCnpj', description: 'CPF/CNPJ inválido' }] });

    await expect(client.createCustomer('Ana', '000')).rejects.toThrow(/400/);
  });

  // specs/0101-integracao-asaas (fase 2).
  it('createCheckout: POST /checkouts só de cartão (DETACHED), devolve id e link', async () => {
    mockFetchOnce(200, { id: 'chk_1', link: 'https://asaas.com/checkoutSession/show?id=chk_1' });

    const result = await client.createCheckout({
      items: [{ name: 'Pizza', quantity: 1, value: 45 }],
      externalReference: 'o-1',
      successUrl: 'https://bsdelivery.com.br/prime/pedidos/o-1',
      cancelUrl: 'https://bsdelivery.com.br/prime/pedidos/o-1',
      expiredUrl: 'https://bsdelivery.com.br/prime/pedidos/o-1',
    });

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({
      billingTypes: ['CREDIT_CARD'],
      chargeTypes: ['DETACHED'],
      items: [{ name: 'Pizza', quantity: 1, value: 45 }],
      externalReference: 'o-1',
      callback: {
        successUrl: 'https://bsdelivery.com.br/prime/pedidos/o-1',
        cancelUrl: 'https://bsdelivery.com.br/prime/pedidos/o-1',
        expiredUrl: 'https://bsdelivery.com.br/prime/pedidos/o-1',
      },
      minutesToExpire: 60,
    });
    expect(result).toEqual({ id: 'chk_1', link: 'https://asaas.com/checkoutSession/show?id=chk_1' });
  });

  it('findPaymentByExternalReference: GET /payments?externalReference=X devolve o 1º resultado', async () => {
    mockFetchOnce(200, { data: [{ id: 'pay_2' }] });

    const result = await client.findPaymentByExternalReference('o-1');

    expect(global.fetch).toHaveBeenCalledWith('https://api-sandbox.asaas.com/v3/payments?externalReference=o-1', expect.objectContaining({ method: 'GET' }));
    expect(result).toEqual({ id: 'pay_2' });
  });

  it('findPaymentByExternalReference: sem resultado devolve null', async () => {
    mockFetchOnce(200, { data: [] });

    expect(await client.findPaymentByExternalReference('o-404')).toBeNull();
  });

  it('createCheckoutWebhook: POST /webhooks só com eventos de checkout', async () => {
    mockFetchOnce(200, { id: 'wh_1' });

    await client.createCheckoutWebhook('https://api.bsdelivery.com.br/webhooks/asaas/r-1', 'token-1', 'dono@primepizza.com');

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(options.body)).toMatchObject({
      url: 'https://api.bsdelivery.com.br/webhooks/asaas/r-1',
      authToken: 'token-1',
      email: 'dono@primepizza.com',
      events: ['CHECKOUT_PAID', 'CHECKOUT_CANCELED', 'CHECKOUT_EXPIRED'],
    });
  });

  it('getBalance: GET /finance/balance', async () => {
    mockFetchOnce(200, { balance: 1234.56 });

    expect(await client.getBalance()).toEqual({ balance: 1234.56 });
    expect(global.fetch).toHaveBeenCalledWith('https://api-sandbox.asaas.com/v3/finance/balance', expect.objectContaining({ method: 'GET' }));
  });

  it('listTransfers: GET /transfers devolve a lista', async () => {
    mockFetchOnce(200, { data: [{ id: 'tr_1', status: 'DONE', value: 100, netValue: 99, transferFee: 1, dateCreated: '2026-10-27' }] });

    const result = await client.listTransfers();

    expect(global.fetch).toHaveBeenCalledWith('https://api-sandbox.asaas.com/v3/transfers?limit=50', expect.objectContaining({ method: 'GET' }));
    expect(result).toEqual([{ id: 'tr_1', status: 'DONE', value: 100, netValue: 99, transferFee: 1, dateCreated: '2026-10-27' }]);
  });
});
