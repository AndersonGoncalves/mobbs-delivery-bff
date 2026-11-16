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
    expect(texts).toContain('CNPJ: 16800957000152');
    expect(texts.some((text) => text.includes('DANFE NFC-e'))).toBe(true);
    expect(texts).toContain('# 2x Pizza Calabresa R$36,00');
    expect(texts).toContain('# Taxa de entrega R$5,00');
    expect(texts).toContain('TOTAL: R$41,00');
    expect(texts).toContain('NFC-e no 123 Serie 1');
    expect(texts).toContain('1234 5678 9012 3456 7890 1234 5678 9012 3456 7890 1234');
  });

  it('imprime o QR code de consulta quando a FocusNFe devolveu qrCode', () => {
    const lines = buildFiscalReceiptLines(buildOrder(), buildRestaurant());
    expect(lines).toContainEqual(expect.objectContaining({ qr: 'https://www.homologacao.focusnfe.com.br/qr/o-1' }));
  });

  it('sem QR code (FocusNFe não devolveu), não inclui nenhuma linha de QR', () => {
    const lines = buildFiscalReceiptLines(buildOrder({ fiscal: { status: 'emitido', ref: 'o-1' } }), buildRestaurant());
    expect(lines.some((line) => line.qr)).toBe(false);
  });
});
