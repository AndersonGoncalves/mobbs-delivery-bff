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
    expect(texts).toContain('Pagamento: Cartao de credito');
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
});
