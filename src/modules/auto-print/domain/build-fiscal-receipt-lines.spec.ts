import { buildFiscalReceiptLines } from './build-fiscal-receipt-lines';
import { IOrder } from '../../orders/domain/entities/order.entity';
import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import { ICustomer } from '../../customers/domain/entities/customer.entity';

function buildOrder(overrides: Partial<IOrder> = {}): IOrder {
  return {
    id: 'o-1',
    orderNumber: 38,
    trackingToken: 'tok-1',
    customerId: 'c-1',
    restaurantId: 'r-1',
    items: [{ id: 'i-1', productId: 'p-1', productName: 'Pizza Calabresa', quantity: 2, unitPrice: 18 }],
    orderType: 'delivery',
    status: 'saiuParaEntrega',
    statusHistory: [],
    subtotal: 36,
    deliveryFee: 5,
    discount: 0,
    total: 41,
    paymentMethod: 'pix',
    createdAt: '2026-11-16T19:19:00.000Z',
    fiscal: {
      status: 'emitido',
      ref: 'o-1',
      number: '123',
      series: '1',
      accessKey: '12345678901234567890123456789012345678901234',
      qrCode: 'https://www.homologacao.focusnfe.com.br/qr/o-1',
      emittedAt: '2026-11-16T19:25:00.000Z',
    },
    ...overrides,
  };
}

function buildRestaurant(overrides: Partial<IRestaurant> = {}): IRestaurant {
  return { id: 'r-1', name: 'Pizzaria do Zé', document: '16800957000152', ...overrides } as IRestaurant;
}

function buildCustomer(overrides: Partial<ICustomer> = {}): ICustomer {
  return { id: 'c-1', name: 'Joao da Silva', phone: '85999999999', ...overrides } as ICustomer;
}

describe('buildFiscalReceiptLines (pedido explícito do usuário, 16/11/2026)', () => {
  it('reproduz a estrutura de um DANFCE simplificado: cabeçalho, itens, total, identificação da nota e chave de acesso em grupos de 4', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    const texts = lines.map((line) => line.text);

    expect(texts).toContain('PIZZARIA DO ZE');
    // Sem dados do XML (fiscal.emitter*), cai no fallback de `Restaurant.document` — mesmo assim
    // formatado (XX.XXX.XXX/XXXX-XX), igual o CNPJ real do XML seria.
    expect(texts).toContain('CNPJ: 16.800.957/0001-52');
    expect(texts.some((text) => text.includes('DANFE NFC-e'))).toBe(true);
    expect(texts.some((text) => /^# 2x Pizza Calabresa\s+R\$36,00$/.test(text))).toBe(true);
    expect(texts.some((text) => /^# Taxa de entrega\s+R\$5,00$/.test(text))).toBe(true);
    expect(texts.some((text) => /^TOTAL:\s+R\$41,00$/.test(text))).toBe(true);
    expect(texts).toContain('NFC-e no 123 Serie 1');
  });

  // Pedido explícito do usuário (16/11/2026) — cabeçalho inteiro vem do XML da nota (dados reais
  // do emitente cadastrados no painel da FocusNFe), nunca do nosso Restaurant/FiscalConfig.
  it('cabeçalho vem inteiro do XML quando fiscal.emitter* está presente, no formato real do DANFCE', () => {
    const lines = buildFiscalReceiptLines(
      buildOrder({
        fiscal: {
          status: 'emitido', ref: 'o-1', number: '13', series: '5',
          emitterName: 'CECILIA ANGELITA DE LIMA CRUZ',
          emitterCnpj: '07456684000180',
          emitterIe: '060760753',
          emitterPhone: '85986404604',
          emitterAddress: { street: 'DOM AURELIANO MATOS', number: '2298', neighborhood: 'CENTRO', zipCode: '62930000', city: 'Limoeiro do Norte', state: 'CE' },
        },
      }),
      buildRestaurant({ name: 'Nome cadastrado na retaguarda (nunca usado aqui)', document: '00000000000000' }),
      null,
    );
    const texts = lines.map((line) => line.text);

    expect(texts).toContain('CECILIA ANGELITA DE LIMA CRUZ');
    expect(texts).toContain('CNPJ: 07.456.684/0001-80  IE: 060760753');
    expect(texts).toContain('DOM AURELIANO MATOS, 2298 - CENTRO');
    expect(texts).toContain('CEP: 62930-000 - Tel.: (85) 98640-4604');
    expect(texts).toContain('Limoeiro do Norte - CE');
  });

  it('imprime o QR code de consulta quando a FocusNFe devolveu qrCode', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    expect(lines).toContainEqual(expect.objectContaining({ qr: 'https://www.homologacao.focusnfe.com.br/qr/o-1' }));
  });

  it('sem QR code (FocusNFe não devolveu), não inclui nenhuma linha de QR', () => {
    const lines = buildFiscalReceiptLines(buildOrder({ fiscal: { status: 'emitido', ref: 'o-1' } }), buildRestaurant(), null);
    expect(lines.some((line) => line.qr)).toBe(false);
  });

  // Pedido explícito do usuário (16/11/2026) — tributos aproximados (Lei 12.741/2012), extraídos
  // do XML da nota (nunca vêm no JSON da FocusNFe), em duas colunas (rótulo esquerda, valor
  // direita) — antes era uma string só concatenada.
  it('imprime tributos aproximados quando o XML foi lido com sucesso, alinhado à direita', () => {
    const lines = buildFiscalReceiptLines(
      buildOrder({ fiscal: { status: 'emitido', ref: 'o-1', approxTaxAmount: 0.44 } }),
      buildRestaurant(),
      null,
    );
    const texts = lines.map((line) => line.text);

    expect(texts.some((text) => /^Tributos aprox\. \(Lei 12\.741\/2012\):\s+R\$0,44$/.test(text))).toBe(true);
  });

  it('sem approxTaxAmount (XML não baixado/lido), não inclui essa linha', () => {
    const lines = buildFiscalReceiptLines(buildOrder({ fiscal: { status: 'emitido', ref: 'o-1' } }), buildRestaurant(), null);
    const texts = lines.map((line) => line.text);

    expect(texts.some((text) => text.startsWith('Tributos aprox.'))).toBe(false);
  });

  // Pedido explícito do usuário (16/11/2026) — "guarde os dois endereços": URL de consulta real
  // do estado do emitente (`consultaUrl`), já devolvida pela FocusNFe.
  it('usa a URL de consulta real do estado do emitente quando presente', () => {
    const lines = buildFiscalReceiptLines(
      buildOrder({ fiscal: { status: 'emitido', ref: 'o-1', consultaUrl: 'http://www.sefaz.ce.gov.br/nfce/consulta' } }),
      buildRestaurant(),
      null,
    );
    const texts = lines.map((line) => line.text);

    expect(texts).toContain('http://www.sefaz.ce.gov.br/nfce/consulta');
    expect(texts).not.toContain('www.nfce.fazenda.gov.br');
  });

  it('sem consultaUrl (FocusNFe não devolveu), cai no fallback genérico federal', () => {
    const lines = buildFiscalReceiptLines(buildOrder({ fiscal: { status: 'emitido', ref: 'o-1' } }), buildRestaurant(), null);
    const texts = lines.map((line) => line.text);

    expect(texts).toContain('www.nfce.fazenda.gov.br');
  });

  // Pedido explícito do usuário (16/11/2026) — mesmo achado do ticket normal (`build-receipt-lines`).
  it('usa divider em vez de texto cru de traços nas linhas separadoras', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);

    expect(lines.filter((line) => line.divider).length).toBeGreaterThan(0);
    expect(lines.some((line) => line.text.includes('-----'))).toBe(false);
  });

  // Pedido explícito do usuário (16/11/2026) — 5 ajustes de fidelidade ao DANFCE real + 3 novos
  // ajustes (chave numa linha só, CONSUMIDOR com dados reais, linha em branco cabeçalho/itens).

  it('inclui a linha estática "Não permite aproveitamento de crédito de ICMS"', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    const texts = lines.map((line) => line.text);

    expect(texts).toContain('Nao permite aproveitamento de credito de ICMS');
  });

  it('pula uma linha em branco entre o cabeçalho e os itens', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    const itemsIndex = lines.findIndex((line) => line.text === 'ITENS (2)');
    const headerDividerIndex = lines.findIndex((line) => line.divider);

    expect(headerDividerIndex).toBeGreaterThan(-1);
    expect(itemsIndex).toBeGreaterThan(headerDividerIndex);
    expect(lines[headerDividerIndex - 1]).toEqual(expect.objectContaining({ text: '' }));
  });

  // Pedido explícito do usuário (16/11/2026) — "Qtd. Total de Itens" e "TOTAL" em duas colunas
  // (rótulo à esquerda, valor empurrado pra ponta direita da linha de 48 colunas).
  it('inclui "Qtd. Total de Itens" com a soma das quantidades, alinhada à direita', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    const texts = lines.map((line) => line.text);
    const qtdLine = texts.find((text) => text.startsWith('Qtd. Total de Itens:'));

    expect(qtdLine).toBeDefined();
    expect(qtdLine).toMatch(/^Qtd\. Total de Itens:\s+2$/);
    expect(qtdLine).toHaveLength(48);
  });

  it('alinha o TOTAL à direita, numa linha de 48 colunas', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    const totalLine = lines.find((line) => line.text.startsWith('TOTAL:'));

    expect(totalLine?.text).toMatch(/^TOTAL:\s+R\$41,00$/);
    expect(totalLine?.text).toHaveLength(48);
    expect(totalLine?.bold).toBe(true);
  });

  // Pedido explícito do usuário (16/11/2026) — "Forma de pagamento" / "Valor pago" também em
  // duas colunas, mesmo padrão do total.
  it('imprime a forma de pagamento e o valor pago em duas colunas alinhadas', () => {
    const lines = buildFiscalReceiptLines(buildOrder({ paymentMethod: 'pix' }), buildRestaurant(), null);
    const texts = lines.map((line) => line.text);

    expect(texts.some((text) => /^Forma de pagamento\s+Valor pago$/.test(text))).toBe(true);
    expect(texts.some((text) => /^- Pagamento Instantaneo \(PIX\)\s+R\$41,00$/.test(text))).toBe(true);
  });

  it('calcula o troco quando o pagamento é em dinheiro e cashChangeFor foi informado', () => {
    const lines = buildFiscalReceiptLines(
      buildOrder({ paymentMethod: 'cash', cashChangeFor: 50 }),
      buildRestaurant(),
      null,
    );
    const texts = lines.map((line) => line.text);

    expect(texts.some((text) => /^- Dinheiro\s+R\$41,00$/.test(text))).toBe(true);
    expect(texts).toContain('Troco: R$9,00');
  });

  it('não imprime linha de troco quando o pagamento não é em dinheiro', () => {
    const lines = buildFiscalReceiptLines(buildOrder({ paymentMethod: 'pix' }), buildRestaurant(), null);
    const texts = lines.map((line) => line.text);

    expect(texts.some((text) => text.startsWith('Troco:'))).toBe(false);
  });

  // Pedido explícito do usuário (16/11/2026) — Federal e Estadual em 2 linhas separadas (antes
  // era 1 linha só concatenando os dois valores), cada uma em 2 colunas.
  it('imprime Trib. Federal aprox e Trib. Estadual aprox em linhas separadas, alinhadas à direita', () => {
    const lines = buildFiscalReceiptLines(
      buildOrder({
        fiscal: {
          status: 'emitido', ref: 'o-1',
          approxTaxFederal: 0.16, approxTaxState: 0.28,
          approxTaxSource: 'IBPT/empresometro.com.br AA45DF',
        },
      }),
      buildRestaurant(),
      null,
    );
    const texts = lines.map((line) => line.text);

    expect(texts.some((text) => /^Trib\. Federal aprox:\s+R\$0,16$/.test(text))).toBe(true);
    expect(texts.some((text) => /^Trib\. Estadual aprox:\s+R\$0,28$/.test(text))).toBe(true);
    expect(texts).not.toContain('Trib. aprox: R$0,16 Federal; R$0,28 Estadual');
    expect(texts).toContain('Fonte: IBPT/empresometro.com.br AA45DF');
  });

  it('sem approxTaxFederal/approxTaxState, não inclui as linhas de Trib. Federal/Estadual nem a Fonte', () => {
    const lines = buildFiscalReceiptLines(buildOrder({ fiscal: { status: 'emitido', ref: 'o-1' } }), buildRestaurant(), null);
    const texts = lines.map((line) => line.text);

    expect(texts.some((text) => text.startsWith('Trib. Federal aprox:'))).toBe(false);
    expect(texts.some((text) => text.startsWith('Trib. Estadual aprox:'))).toBe(false);
    expect(texts.some((text) => text.startsWith('Fonte:'))).toBe(false);
  });

  it('mostra a URL de consulta antes da chave de acesso (ordem igual ao DANFCE real)', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    const texts = lines.map((line) => line.text);
    const consultaIndex = texts.indexOf('Consulte pela Chave de Acesso em');
    const chaveHeadingIndex = texts.indexOf('CHAVE DE ACESSO');

    expect(consultaIndex).toBeGreaterThan(-1);
    expect(chaveHeadingIndex).toBeGreaterThan(consultaIndex);
  });

  // Pedido explícito do usuário (16/11/2026) — bloco inteiro centralizado: da chamada pra
  // consulta até a chave de acesso.
  it('centraliza o bloco "consulte pela chave de acesso" inteiro, da chamada até a chave', () => {
    const lines = buildFiscalReceiptLines(
      buildOrder({ fiscal: { status: 'emitido', ref: 'o-1', accessKey: '12345678901234567890123456789012345678901234', consultaUrl: 'http://www.sefaz.ce.gov.br/nfce/consulta' } }),
      buildRestaurant(),
      null,
    );

    const consulta = lines.find((line) => line.text === 'Consulte pela Chave de Acesso em');
    const url = lines.find((line) => line.text === 'http://www.sefaz.ce.gov.br/nfce/consulta');
    const heading = lines.find((line) => line.text === 'CHAVE DE ACESSO');
    const keyLine = lines.find((line) => line.text.replace(/\s/g, '') === '12345678901234567890123456789012345678901234');

    expect(consulta?.center).toBe(true);
    expect(url?.center).toBe(true);
    expect(heading?.center).toBe(true);
    expect(keyLine?.center).toBe(true);
  });

  it('imprime a chave de acesso numa única linha, em negrito e com fonte reduzida', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    const keyLine = lines.find((line) => line.text.replace(/\s/g, '') === '12345678901234567890123456789012345678901234');

    expect(keyLine).toEqual(expect.objectContaining({ bold: true, small: true }));
    expect(lines.filter((line) => line.text.includes('1234 5678')).length).toBe(1);
  });

  it('sem accessKey, não inclui a seção "CHAVE DE ACESSO"', () => {
    const lines = buildFiscalReceiptLines(buildOrder({ fiscal: { status: 'emitido', ref: 'o-1' } }), buildRestaurant(), null);
    const texts = lines.map((line) => line.text);

    expect(texts).not.toContain('CHAVE DE ACESSO');
  });

  it('CONSUMIDOR mostra "NÃO IDENTIFICADO" quando não há customer ou customer sem CPF', () => {
    const linesSemCustomer = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    const linesCustomerSemCpf = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), buildCustomer({ document: undefined }));

    for (const lines of [linesSemCustomer, linesCustomerSemCpf]) {
      const texts = lines.map((line) => line.text);
      expect(texts).toContain('CONSUMIDOR NAO IDENTIFICADO');
    }
  });

  it('CONSUMIDOR mostra CPF e nome reais do pedido quando o customer tem document cadastrado', () => {
    const lines = buildFiscalReceiptLines(
      buildOrder(),
      buildRestaurant(),
      buildCustomer({ name: 'Joao da Silva', document: '12345678900' }),
    );
    const texts = lines.map((line) => line.text);

    expect(texts).toContain('CPF: 123.456.789-00');
    expect(texts).toContain('JOAO DA SILVA');
    expect(texts).not.toContain('CONSUMIDOR NAO IDENTIFICADO');
  });

  it('inclui o rótulo "Consulta via Leitor de QR Code" centralizado, antes do QR', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    const texts = lines.map((line) => line.text);
    const labelIndex = texts.indexOf('Consulta via Leitor de QR Code');
    const qrIndex = lines.findIndex((line) => line.qr);

    expect(labelIndex).toBeGreaterThan(-1);
    expect(lines[labelIndex].center).toBe(true);
    expect(qrIndex).toBeGreaterThan(labelIndex);
  });

  it('pula uma linha em branco antes de "Consulta via Leitor de QR Code"', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    const labelIndex = lines.findIndex((line) => line.text === 'Consulta via Leitor de QR Code');

    expect(labelIndex).toBeGreaterThan(0);
    expect(lines[labelIndex - 1]).toEqual(expect.objectContaining({ text: '' }));
  });

  // Pedido explícito do usuário (16/11/2026) — protocolo de autorização ganha a data/hora da
  // emissão ao lado (mesmo timestamp de "Emissao:").
  it('imprime o protocolo de autorização com a data/hora da emissão ao lado', () => {
    const lines = buildFiscalReceiptLines(
      buildOrder({ fiscal: { status: 'emitido', ref: 'o-1', protocol: '223261032153733', emittedAt: '2026-11-16T20:07:34.000Z' } }),
      buildRestaurant(),
      null,
    );
    const protocolLine = lines.find((line) => line.text.startsWith('Protocolo de autorizacao:'));

    expect(protocolLine).toBeDefined();
    expect(protocolLine?.text).toContain('223261032153733');
    // Pedido explícito do usuário (16/11/2026) — achado real: rótulo + protocolo + data ultrapassa
    // 48 caracteres mesmo em Fonte A normal — `noWrap` bypassa o fold de 48 colunas da bridge.
    expect(protocolLine?.noWrap).toBe(true);
    // Pedido explícito do usuário (17/11/2026) — fonte reduzida (Fonte B), pra essa quantidade de
    // caracteres caber de verdade na largura física do papel (bypass sozinho não bastava).
    expect(protocolLine?.small).toBe(true);
    expect(protocolLine?.text).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
  });

  it('sem fiscal.protocol, não inclui a linha de protocolo', () => {
    const lines = buildFiscalReceiptLines(buildOrder({ fiscal: { status: 'emitido', ref: 'o-1' } }), buildRestaurant(), null);
    const texts = lines.map((line) => line.text);

    expect(texts.some((text) => text.startsWith('Protocolo de autorizacao:'))).toBe(false);
  });

  // Pedido explícito do usuário (16/11/2026) — ajustes de layout em cima da foto real do cupom:
  // linha em branco, traços novos em 4 pontos, e remoção do rodapé "-- BsDelivery --".
  it('pula uma linha em branco entre o endereço do emitente e o bloco "DANFE NFC-e"', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    const danfeIndex = lines.findIndex((line) => line.text.includes('DANFE NFC-e'));

    expect(danfeIndex).toBeGreaterThan(0);
    expect(lines[danfeIndex - 1]).toEqual(expect.objectContaining({ text: '' }));
  });

  it('inclui um traço logo depois de "ITENS (N)", antes da lista de itens', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    const itensIndex = lines.findIndex((line) => line.text === 'ITENS (2)');

    expect(itensIndex).toBeGreaterThan(-1);
    expect(lines[itensIndex + 1]).toEqual(expect.objectContaining({ divider: true }));
  });

  // Pedido explícito do usuário (16/11/2026) — reordenado: TOTAL -> traço -> forma de pagamento ->
  // traço -> tributos -> traço -> NFC-e no... (antes os tributos vinham logo depois do TOTAL,
  // antes da forma de pagamento).
  it('inclui um traço logo depois do TOTAL, antes de "Forma de pagamento"', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    const totalIndex = lines.findIndex((line) => line.text.startsWith('TOTAL:'));
    const formaIndex = lines.findIndex((line) => line.text.startsWith('Forma de pagamento'));

    expect(totalIndex).toBeGreaterThan(-1);
    expect(formaIndex).toBeGreaterThan(totalIndex);
    expect(lines[totalIndex + 1]).toEqual(expect.objectContaining({ divider: true }));
    expect(lines[formaIndex - 1]).toEqual(expect.objectContaining({ divider: true }));
  });

  it('inclui um traço depois do bloco de forma de pagamento, antes dos tributos aproximados', () => {
    const lines = buildFiscalReceiptLines(
      buildOrder({ fiscal: { status: 'emitido', ref: 'o-1', approxTaxAmount: 0.44 } }),
      buildRestaurant(),
      null,
    );
    const pagamentoIndex = lines.findIndex((line) => line.text.startsWith('- Pagamento'));
    const tributosIndex = lines.findIndex((line) => line.text.startsWith('Tributos aprox.'));

    expect(pagamentoIndex).toBeGreaterThan(-1);
    expect(tributosIndex).toBeGreaterThan(pagamentoIndex);
    expect(lines[pagamentoIndex + 1]).toEqual(expect.objectContaining({ divider: true }));
  });

  // Pedido explícito do usuário (17/11/2026) — linha em branco logo acima do bloco de tributos
  // (antes do traço do item anterior) e logo abaixo (antes do próximo traço).
  it('inclui linha em branco acima e abaixo do bloco de tributos, e o traço antes de "NFC-e no..."', () => {
    const lines = buildFiscalReceiptLines(
      buildOrder({ fiscal: { status: 'emitido', ref: 'o-1', number: '123', series: '1', approxTaxAmount: 0.44 } }),
      buildRestaurant(),
      null,
    );
    const tributosIndex = lines.findIndex((line) => line.text.startsWith('Tributos aprox.'));
    const nfceIndex = lines.findIndex((line) => line.text.startsWith('NFC-e no'));

    expect(tributosIndex).toBeGreaterThan(-1);
    expect(nfceIndex).toBeGreaterThan(tributosIndex);
    expect(lines[tributosIndex - 1]).toEqual(expect.objectContaining({ text: '' }));
    expect(lines[tributosIndex + 1]).toEqual(expect.objectContaining({ text: '' }));
    expect(lines[tributosIndex + 2]).toEqual(expect.objectContaining({ divider: true }));
  });

  it('inclui um traço depois de "Emissao: ... Via Consumidor", no lugar da linha em branco', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    const emissaoIndex = lines.findIndex((line) => line.text.startsWith('Emissao:'));

    expect(emissaoIndex).toBeGreaterThan(-1);
    expect(lines[emissaoIndex + 1]).toEqual(expect.objectContaining({ divider: true }));
  });

  it('pula uma linha em branco antes de "Consulte pela Chave de Acesso em"', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    const consultaIndex = lines.findIndex((line) => line.text === 'Consulte pela Chave de Acesso em');

    expect(consultaIndex).toBeGreaterThan(0);
    expect(lines[consultaIndex - 1]).toEqual(expect.objectContaining({ text: '' }));
  });

  it('inclui um traço depois do bloco centralizado da chave de acesso, antes de "CONSUMIDOR"', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    const consumidorIndex = lines.findIndex((line) => line.text === 'CONSUMIDOR');

    expect(consumidorIndex).toBeGreaterThan(0);
    expect(lines[consumidorIndex - 1]).toEqual(expect.objectContaining({ divider: true }));
  });

  it('inclui um traço depois da identificação do consumidor, antes do rótulo de QR', () => {
    const lines = buildFiscalReceiptLines(
      buildOrder(),
      buildRestaurant(),
      buildCustomer({ name: 'Joao da Silva', document: '12345678900' }),
    );
    const nameIndex = lines.findIndex((line) => line.text === 'JOAO DA SILVA');

    expect(nameIndex).toBeGreaterThan(-1);
    expect(lines[nameIndex + 1]).toEqual(expect.objectContaining({ divider: true }));
  });

  it('não imprime mais o rodapé "-- BsDelivery --"', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
    const texts = lines.map((line) => line.text);

    expect(texts).not.toContain('-- BsDelivery --');
  });

  // Pedido explícito do usuário (17/11/2026) — achado real: o cupom fiscal de mesa/balcão não
  // mostrava taxa de serviço/couvert/ajuste, então o TOTAL não batia com a soma dos itens impressos.
  describe('taxa de serviço, couvert e ajuste de mesa/balcão (17/11/2026)', () => {
    function buildTableOrder(overrides: Partial<IOrder> = {}): IOrder {
      return buildOrder({
        orderType: 'table',
        subtotal: 100,
        deliveryFee: 0,
        total: 110,
        ...overrides,
      });
    }

    it('imprime a taxa de serviço quando maior que zero, em duas colunas', () => {
      const lines = buildTableOrder({ serviceChargeAmount: 10 });
      const resultLines = buildFiscalReceiptLines(lines, buildRestaurant(), null);
      const texts = resultLines.map((line) => line.text);

      expect(texts.some((text) => /^# Taxa de servico\s+R\$10,00$/.test(text))).toBe(true);
    });

    it('não imprime a taxa de serviço quando ausente ou zero', () => {
      const semServiceCharge = buildFiscalReceiptLines(buildTableOrder(), buildRestaurant(), null);
      const comServiceChargeZero = buildFiscalReceiptLines(buildTableOrder({ serviceChargeAmount: 0 }), buildRestaurant(), null);

      for (const lines of [semServiceCharge, comServiceChargeZero]) {
        expect(lines.some((line) => line.text.startsWith('# Taxa de servico'))).toBe(false);
      }
    });

    it('imprime o couvert quando maior que zero, em duas colunas', () => {
      const lines = buildFiscalReceiptLines(buildTableOrder({ coverCharge: 15 }), buildRestaurant(), null);
      const texts = lines.map((line) => line.text);

      expect(texts.some((text) => /^# Couvert\s+R\$15,00$/.test(text))).toBe(true);
    });

    it('não imprime o couvert quando ausente ou zero', () => {
      const semCouvert = buildFiscalReceiptLines(buildTableOrder(), buildRestaurant(), null);
      const comCouvertZero = buildFiscalReceiptLines(buildTableOrder({ coverCharge: 0 }), buildRestaurant(), null);

      for (const lines of [semCouvert, comCouvertZero]) {
        expect(lines.some((line) => line.text.startsWith('# Couvert'))).toBe(false);
      }
    });

    it('imprime o ajuste manual (desconto fixo) com a descrição entre parênteses', () => {
      const lines = buildFiscalReceiptLines(
        buildTableOrder({ tableAdjustment: { type: 'discount', mode: 'fixed', value: 5, description: 'cortesia' } }),
        buildRestaurant(),
        null,
      );
      const texts = lines.map((line) => line.text);

      expect(texts.some((text) => /^# Desconto \(cortesia\)\s+R\$5,00$/.test(text))).toBe(true);
    });

    it('imprime o ajuste manual (acréscimo percentual) calculado sobre subtotal + serviço + couvert', () => {
      const lines = buildFiscalReceiptLines(
        buildTableOrder({
          serviceChargeAmount: 10,
          coverCharge: 10,
          tableAdjustment: { type: 'surcharge', mode: 'percent', value: 10 },
        }),
        buildRestaurant(),
        null,
      );
      const texts = lines.map((line) => line.text);

      // base = 100 (subtotal) + 10 (serviço) + 10 (couvert) = 120; 10% = 12
      expect(texts.some((text) => /^# Acrescimo\s+R\$12,00$/.test(text))).toBe(true);
    });

    it('não imprime linha de ajuste quando o pedido não tem tableAdjustment', () => {
      const lines = buildFiscalReceiptLines(buildTableOrder(), buildRestaurant(), null);
      const texts = lines.map((line) => line.text);

      expect(texts.some((text) => text.startsWith('# Desconto') || text.startsWith('# Acrescimo'))).toBe(false);
    });

    it('pedido de delivery nunca imprime essas linhas (campos de mesa inexistentes)', () => {
      const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant(), null);
      const texts = lines.map((line) => line.text);

      expect(texts.some((text) => text.startsWith('# Taxa de servico') || text.startsWith('# Couvert') || text.startsWith('# Desconto') || text.startsWith('# Acrescimo'))).toBe(false);
    });
  });
});
