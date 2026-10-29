import { FocusNfeApiClient } from './focus-nfe-client';

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(body === undefined ? '' : JSON.stringify(body)),
  }) as unknown as typeof fetch;
}

describe('FocusNfeApiClient (specs/0091-integracao-fiscal-focusnfe)', () => {
  const client = new FocusNfeApiClient('token-1', 'https://homologacao.focusnfe.com.br');

  afterEach(() => jest.restoreAllMocks());

  it('emitNfce: POST /v2/nfce?ref={ref} com Basic Auth (token como usuário, senha vazia)', async () => {
    mockFetchOnce(201, { ref: 'o-1', status: 'autorizado', caminho_danfe: '/notas/o-1.html' });

    const result = await client.emitNfce('o-1', {
      cnpj_emitente: '11222333000181',
      data_emissao: '2026-10-28T00:00:00Z',
      presenca_comprador: '1',
      modalidade_frete: '9',
      local_destino: '1',
      natureza_operacao: 'Venda de mercadoria',
      items: [],
      formas_pagamento: [{ forma_pagamento: '01', valor_pagamento: 30 }],
    });

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://homologacao.focusnfe.com.br/v2/nfce?ref=o-1');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe(`Basic ${Buffer.from('token-1:').toString('base64')}`);
    expect(result).toEqual({ ref: 'o-1', status: 'autorizado', caminho_danfe: '/notas/o-1.html' });
  });

  it('getNfceStatus: GET /v2/nfce/{ref}', async () => {
    mockFetchOnce(200, { ref: 'o-1', status: 'processando_autorizacao' });

    const result = await client.getNfceStatus('o-1');

    const [url, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://homologacao.focusnfe.com.br/v2/nfce/o-1');
    expect(options.method).toBe('GET');
    expect(result.status).toBe('processando_autorizacao');
  });

  it('cancelNfce: DELETE /v2/nfce/{ref} com justificativa no corpo', async () => {
    mockFetchOnce(200, { ref: 'o-1', status: 'cancelado' });

    const result = await client.cancelNfce('o-1', 'Cliente cancelou o pedido após a emissão');

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.method).toBe('DELETE');
    expect(JSON.parse(options.body)).toEqual({ justificativa: 'Cliente cancelou o pedido após a emissão' });
    expect(result.status).toBe('cancelado');
  });

  it('um 4xx com corpo de rejeição decodificável NÃO lança — devolve o corpo pro chamador decidir', async () => {
    mockFetchOnce(422, { status: 'erro_autorizacao', mensagem_sefaz: 'Rejeição 704: duplicidade' });

    const result = await client.emitNfce('o-2', {
      cnpj_emitente: '11222333000181',
      data_emissao: '2026-10-28T00:00:00Z',
      presenca_comprador: '1',
      modalidade_frete: '9',
      local_destino: '1',
      natureza_operacao: 'Venda de mercadoria',
      items: [],
      formas_pagamento: [],
    });

    expect(result).toEqual({ status: 'erro_autorizacao', mensagem_sefaz: 'Rejeição 704: duplicidade' });
  });

  it('um 5xx lança erro (falha de transporte, não de negócio)', async () => {
    mockFetchOnce(500, undefined);

    await expect(client.getNfceStatus('o-1')).rejects.toThrow(/respondeu 500/);
  });

  it('emitCfe/emitNfe lançam erro explícito — fora de escopo da v1', async () => {
    await expect(client.emitCfe()).rejects.toThrow(/CFe/);
    await expect(client.emitNfe()).rejects.toThrow(/NFe/);
  });
});
