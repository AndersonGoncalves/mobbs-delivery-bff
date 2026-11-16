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

  // Pedido explícito do usuário (16/11/2026) — validado contra o XML real de uma emissão em
  // produção (pedido #180, 16/11/2026): tributos aproximados (Lei 12.741/2012) e IE do emitente
  // nunca vêm no JSON da FocusNFe, só no XML da própria nota.
  describe('fetchNfceXmlFields (achado real 16/11/2026)', () => {
    function mockFetchXml(status: number, xml: string | undefined) {
      global.fetch = jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        text: jest.fn().mockResolvedValue(xml ?? ''),
      }) as unknown as typeof fetch;
    }

    // Fixture reduzida do XML real (pedido #180, 16/11/2026) — propositalmente com um `vTotTrib`
    // de ITEM diferente do TOTAL (0.10 vs 0.44), pra provar que a extração pega o de `<ICMSTot>`,
    // nunca o primeiro `vTotTrib` que aparecer no documento.
    const REAL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc><NFe><infNFe><emit><xNome>CECILIA ANGELITA DE LIMA CRUZ</xNome><CNPJ>07456684000180</CNPJ>
<enderEmit><xLgr>DOM AURELIANO MATOS</xLgr><nro>2298</nro><xBairro>CENTRO</xBairro><cMun>2307601</cMun><xMun>Limoeiro do Norte</xMun><UF>CE</UF><CEP>62930000</CEP><fone>85986404604</fone></enderEmit>
<IE>060760753</IE><CRT>1</CRT></emit>
<det nItem="1"><imposto><vTotTrib>0.10</vTotTrib></imposto></det>
<total><ICMSTot><vNF>1.00</vNF><vTotTrib>0.44</vTotTrib></ICMSTot></total>
</infNFe></NFe><protNFe><infProt><nProt>223261031969253</nProt></infProt></protNFe></nfeProc>`;

    it('extrai vTotTrib de <ICMSTot> (nunca o do item) e os dados completos do emitente de <emit>/<enderEmit>', async () => {
      mockFetchXml(200, REAL_XML);

      const result = await client.fetchNfceXmlFields('https://api.focusnfe.com.br/arquivos/x/o-1.xml');

      expect(result).toEqual({
        approxTaxAmount: 0.44,
        emitterName: 'CECILIA ANGELITA DE LIMA CRUZ',
        emitterCnpj: '07456684000180',
        emitterIe: '060760753',
        emitterPhone: '85986404604',
        emitterAddress: {
          street: 'DOM AURELIANO MATOS',
          number: '2298',
          neighborhood: 'CENTRO',
          zipCode: '62930000',
          city: 'Limoeiro do Norte',
          state: 'CE',
        },
      });
    });

    it('resposta não-OK (XML indisponível/expirado): devolve objeto vazio, nunca lança', async () => {
      mockFetchXml(404, undefined);

      await expect(client.fetchNfceXmlFields('https://api.focusnfe.com.br/arquivos/x/o-1.xml')).resolves.toEqual({});
    });

    it('falha de rede/timeout: devolve objeto vazio, nunca lança (best-effort)', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch;
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(client.fetchNfceXmlFields('https://api.focusnfe.com.br/arquivos/x/o-1.xml')).resolves.toEqual({});
      consoleErrorSpy.mockRestore();
    });

    it('XML sem IE/endereço/tributos (só nome): devolve só o nome, resto undefined, sem lançar', async () => {
      mockFetchXml(200, '<nfeProc><NFe><infNFe><emit><xNome>Loja</xNome></emit><total><ICMSTot><vNF>1.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>');

      await expect(client.fetchNfceXmlFields('https://api.focusnfe.com.br/arquivos/x/o-1.xml')).resolves.toEqual({
        approxTaxAmount: undefined,
        emitterName: 'Loja',
        emitterCnpj: undefined,
        emitterIe: undefined,
        emitterPhone: undefined,
        emitterAddress: undefined,
      });
    });
  });
});
