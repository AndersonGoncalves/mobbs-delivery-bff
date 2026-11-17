import { buildReceiptLines } from './build-receipt-lines';
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
    items: [
      { id: 'i-1', productId: 'p-1', productName: 'So Frango 26CM', quantity: 2, unitPrice: 18 },
      { id: 'i-2', productId: 'p-2', productName: 'Carne do sol com queijo 26CM', quantity: 2, unitPrice: 24 },
    ],
    orderType: 'pickup',
    status: 'confirmado',
    statusHistory: [],
    subtotal: 84,
    deliveryFee: 0,
    discount: 0,
    total: 84,
    paymentMethod: 'creditCard',
    createdAt: '2026-10-13T19:19:00.000Z',
    ...overrides,
  };
}

function buildRestaurant(overrides: Partial<IRestaurant> = {}): IRestaurant {
  return { id: 'r-1', name: 'Excelentíssimo', phone: '85989176835', document: '16800957000152', ...overrides } as IRestaurant;
}

function buildCustomer(overrides: Partial<ICustomer> = {}): ICustomer {
  return { id: 'c-1', name: 'Anderson', email: 'anderson@x.com', phone: '85986404604', ...overrides };
}

describe('buildReceiptLines (specs/0139-impressao-automatica-bridge)', () => {
  it('reproduz o cabeçalho, ID/horário/tipo e totais sem acento, igual a OrderPrintArea.tsx', () => {
    const lines = buildReceiptLines(buildOrder(), buildRestaurant(), buildCustomer());
    const texts = lines.map((line) => line.text);

    expect(texts).toContain('EXCELENTISSIMO');
    expect(texts).toContain('Tel: 85989176835');
    expect(texts).toContain('CNPJ: 16800957000152');
    expect(texts).toContain('ID PEDIDO: 38');
    expect(texts).toContain('Horario: 13/10/2026 16:19');
    expect(texts).toContain('Tipo: RETIRADA BALCAO');
    expect(texts).toContain('NOME: ANDERSON');
    expect(texts).toContain('Fone: 85986404604');
    expect(texts).toContain('ITENS (4)');
    expect(texts).toContain('# 2x So Frango 26CM R$36,00');
    expect(texts).toContain('# 2x Carne do sol com queijo 26CM R$48,00');
    expect(texts).toContain('Itens (4): R$84,00');
    expect(texts).toContain('Desconto: R$0,00');
    expect(texts).toContain('Entrega: R$0,00');
    expect(texts).toContain('TOTAL: R$84,00');
    expect(texts).toContain('Pagamento: Cartao de Credito Maquininha');
    expect(texts).toContain('-- BsDelivery --');
  });

  it('marca TOTAL e o nome do restaurante como negrito (bold), resto não', () => {
    const lines = buildReceiptLines(buildOrder(), buildRestaurant(), buildCustomer());

    expect(lines.find((line) => line.text === 'EXCELENTISSIMO')?.bold).toBe(true);
    expect(lines.find((line) => line.text === 'TOTAL: R$84,00')?.bold).toBe(true);
    expect(lines.find((line) => line.text.startsWith('ID PEDIDO'))?.bold).toBeFalsy();
  });

  it('pedido de entrega mostra o endereço sem acento', () => {
    const lines = buildReceiptLines(
      buildOrder({ orderType: 'delivery', deliveryAddress: 'Rua São José, 10' }),
      buildRestaurant(),
      buildCustomer(),
    );

    expect(lines.map((line) => line.text)).toContain('Endereco: Rua Sao Jose, 10');
  });

  it('sem customer resolvido, não quebra e não mostra NOME/Fone', () => {
    const lines = buildReceiptLines(buildOrder(), buildRestaurant(), null);

    expect(lines.map((line) => line.text).some((text) => text.startsWith('NOME:'))).toBe(false);
  });

  it('item com seleção aninhada aparece indentado, sem acento', () => {
    const order = buildOrder({
      items: [
        {
          id: 'i-1',
          productId: 'p-1',
          productName: 'Pizza',
          quantity: 1,
          unitPrice: 50,
          selections: [
            { groupName: 'Borda', optionName: 'Catupiry', priceDelta: 8, nestedSelections: [{ groupName: 'Extra', optionName: 'Bacon', priceDelta: 4 }] },
          ],
          notes: 'sem cebola',
        },
      ],
    });
    const lines = buildReceiptLines(order, buildRestaurant(), buildCustomer());
    const texts = lines.map((line) => line.text);

    expect(texts.some((text) => text.includes('Borda: Catupiry'))).toBe(true);
    expect(texts.some((text) => text.includes('Extra: Bacon'))).toBe(true);
    expect(texts).toContain('  Obs.: sem cebola');
  });

  // Pedido explícito do usuário (16/11/2026) — achado real: linha tracejada fixa (32 traços)
  // ficava curta porque a largura real da impressora (default 48) é maior. `divider: true` deixa
  // a bridge desenhar a linha na largura certa via `drawLine()`, em vez do BFF adivinhar um número.
  it('usa divider em vez de texto cru de traços nas linhas separadoras', () => {
    const lines = buildReceiptLines(buildOrder(), buildRestaurant(), buildCustomer());

    expect(lines.filter((line) => line.divider).length).toBeGreaterThan(0);
    expect(lines.some((line) => line.text.includes('-----'))).toBe(false);
  });

  // Pedido explícito do usuário (17/11/2026) — mesa/balcão passa a entrar na fila automática,
  // então `buildReceiptLines` precisa do mesmo branch de totais/pagamento que `OrderPrintArea.tsx`
  // já tinha só pro ticket impresso via navegador.
  describe('mesa/balcão (17/11/2026)', () => {
    function buildTableOrder(overrides: Partial<IOrder> = {}): IOrder {
      return buildOrder({
        orderType: 'table',
        tableName: 'Mesa 5',
        subtotal: 100,
        deliveryFee: 0,
        total: 100,
        ...overrides,
      });
    }

    it('mostra "Mesa: {nome}" no cabeçalho quando tableName está presente', () => {
      const lines = buildReceiptLines(buildTableOrder({ tableName: 'Mesa da Varanda' }), buildRestaurant(), null);

      expect(lines.map((line) => line.text)).toContain('Mesa: Mesa da Varanda');
    });

    it('mostra "Balcao" quando não há tableName', () => {
      const lines = buildReceiptLines(buildTableOrder({ tableName: undefined }), buildRestaurant(), null);

      expect(lines.map((line) => line.text)).toContain('Balcao');
    });

    it('mostra Subtotal, Taxa de servico, Couvert e o ajuste, em vez de Itens/Desconto/Entrega', () => {
      const lines = buildReceiptLines(
        buildTableOrder({
          serviceChargeAmount: 10,
          coverCharge: 15,
          tableAdjustment: { type: 'discount', mode: 'fixed', value: 5, description: 'cortesia' },
          total: 120,
        }),
        buildRestaurant(),
        null,
      );
      const texts = lines.map((line) => line.text);

      expect(texts).toContain('Subtotal: R$100,00');
      expect(texts).toContain('Taxa de servico: R$10,00');
      expect(texts).toContain('Couvert: R$15,00');
      expect(texts).toContain('Desconto (cortesia): R$5,00');
      expect(texts).not.toContain('Itens (4): R$100,00');
      expect(texts.some((text) => text.startsWith('Entrega:'))).toBe(false);
    });

    it('não mostra taxa de servico/couvert/ajuste quando ausentes', () => {
      const lines = buildReceiptLines(buildTableOrder(), buildRestaurant(), null);
      const texts = lines.map((line) => line.text);

      expect(texts.some((text) => text.startsWith('Taxa de servico'))).toBe(false);
      expect(texts.some((text) => text.startsWith('Couvert'))).toBe(false);
      expect(texts.some((text) => text.startsWith('Desconto') || text.startsWith('Acrescimo'))).toBe(false);
    });

    it('mostra uma linha "Pago (forma)" por pagamento de tablePayments, em vez de "Pagamento:"', () => {
      const lines = buildReceiptLines(
        buildTableOrder({
          tablePayments: [
            { id: 'pay-1', method: 'cash', amount: 60, paidAt: '2026-11-17T20:00:00.000Z', paidBy: 'op-1' },
            { id: 'pay-2', method: 'pix', amount: 40, paidAt: '2026-11-17T20:01:00.000Z', paidBy: 'op-1' },
          ],
        }),
        buildRestaurant(),
        null,
      );
      const texts = lines.map((line) => line.text);

      expect(texts).toContain('Pago (Dinheiro): R$60,00');
      expect(texts).toContain('Pago (Pix): R$40,00');
      expect(texts.some((text) => text.startsWith('Pagamento:'))).toBe(false);
    });
  });
});
