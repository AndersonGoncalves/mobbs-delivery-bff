import { buildFiscalReceiptLines } from './build-fiscal-receipt-lines';
import { IOrder } from '../../orders/domain/entities/order.entity';
import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';

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

describe('buildFiscalReceiptLines (pedido explícito do usuário, 16/11/2026)', () => {
  it('reproduz a estrutura de um DANFCE simplificado: cabeçalho, itens, total, identificação da nota e chave de acesso em grupos de 4', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant());
    const texts = lines.map((line) => line.text);

    expect(texts).toContain('PIZZARIA DO ZE');
    // Sem dados do XML (fiscal.emitter*), cai no fallback de `Restaurant.document` — mesmo assim
    // formatado (XX.XXX.XXX/XXXX-XX), igual o CNPJ real do XML seria.
    expect(texts).toContain('CNPJ: 16.800.957/0001-52');
    expect(texts.some((text) => text.includes('DANFE NFC-e'))).toBe(true);
    expect(texts).toContain('# 2x Pizza Calabresa R$36,00');
    expect(texts).toContain('# Taxa de entrega R$5,00');
    expect(texts).toContain('TOTAL: R$41,00');
    expect(texts).toContain('NFC-e no 123 Serie 1');
    expect(texts).toContain('1234 5678 9012 3456 7890 1234 5678 9012 3456 7890 1234');
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
    );
    const texts = lines.map((line) => line.text);

    expect(texts).toContain('CECILIA ANGELITA DE LIMA CRUZ');
    expect(texts).toContain('CNPJ: 07.456.684/0001-80  IE: 060760753');
    expect(texts).toContain('DOM AURELIANO MATOS, 2298 - CENTRO');
    expect(texts).toContain('CEP: 62930-000 - Tel.: (85) 98640-4604');
    expect(texts).toContain('Limoeiro do Norte - CE');
  });

  it('imprime o QR code de consulta quando a FocusNFe devolveu qrCode', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant());
    expect(lines).toContainEqual(expect.objectContaining({ qr: 'https://www.homologacao.focusnfe.com.br/qr/o-1' }));
  });

  it('sem QR code (FocusNFe não devolveu), não inclui nenhuma linha de QR', () => {
    const lines = buildFiscalReceiptLines(buildOrder({ fiscal: { status: 'emitido', ref: 'o-1' } }), buildRestaurant());
    expect(lines.some((line) => line.qr)).toBe(false);
  });

  // Pedido explícito do usuário (16/11/2026) — tributos aproximados (Lei 12.741/2012), extraídos
  // do XML da nota (nunca vêm no JSON da FocusNFe).
  it('imprime tributos aproximados quando o XML foi lido com sucesso', () => {
    const lines = buildFiscalReceiptLines(
      buildOrder({ fiscal: { status: 'emitido', ref: 'o-1', approxTaxAmount: 0.44 } }),
      buildRestaurant(),
    );
    const texts = lines.map((line) => line.text);

    expect(texts).toContain('Tributos aprox. (Lei 12.741/2012): R$0,44');
  });

  it('sem approxTaxAmount (XML não baixado/lido), não inclui essa linha', () => {
    const lines = buildFiscalReceiptLines(buildOrder({ fiscal: { status: 'emitido', ref: 'o-1' } }), buildRestaurant());
    const texts = lines.map((line) => line.text);

    expect(texts.some((text) => text.startsWith('Tributos aprox.'))).toBe(false);
  });

  // Pedido explícito do usuário (16/11/2026) — "guarde os dois endereços": URL de consulta real
  // do estado do emitente (`consultaUrl`), já devolvida pela FocusNFe.
  it('usa a URL de consulta real do estado do emitente quando presente', () => {
    const lines = buildFiscalReceiptLines(
      buildOrder({ fiscal: { status: 'emitido', ref: 'o-1', consultaUrl: 'http://www.sefaz.ce.gov.br/nfce/consulta' } }),
      buildRestaurant(),
    );
    const texts = lines.map((line) => line.text);

    expect(texts).toContain('http://www.sefaz.ce.gov.br/nfce/consulta');
    expect(texts).not.toContain('www.nfce.fazenda.gov.br');
  });

  it('sem consultaUrl (FocusNFe não devolveu), cai no fallback genérico federal', () => {
    const lines = buildFiscalReceiptLines(buildOrder({ fiscal: { status: 'emitido', ref: 'o-1' } }), buildRestaurant());
    const texts = lines.map((line) => line.text);

    expect(texts).toContain('www.nfce.fazenda.gov.br');
  });

  // Pedido explícito do usuário (16/11/2026) — mesmo achado do ticket normal (`build-receipt-lines`).
  it('usa divider em vez de texto cru de traços nas linhas separadoras', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant());

    expect(lines.filter((line) => line.divider).length).toBeGreaterThan(0);
    expect(lines.some((line) => line.text.includes('-----'))).toBe(false);
  });
});
