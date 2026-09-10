import { IOrder } from '../../orders/domain/entities/order.entity';
import { buildOrderReceiptMessage, OrderReceiptInput } from './order-receipt-message-builder';

function buildOrder(overrides: Partial<IOrder> = {}): IOrder {
  return {
    id: 'o-1',
    orderNumber: 123,
    trackingToken: 'abc123',
    customerId: 'c-1',
    restaurantId: 'r-1',
    items: [
      {
        id: 'i-1',
        productId: 'p-1',
        productName: 'X-Burger',
        quantity: 2,
        unitPrice: 25,
        selections: [
          {
            groupName: 'Tamanho',
            optionName: 'Grande',
            priceDelta: 5,
            nestedSelections: [{ groupName: 'Ponto', optionName: 'Bem passado', priceDelta: 0 }],
          },
        ],
      },
    ],
    orderType: 'delivery',
    deliveryAddress: 'Rua A, 123 - Centro',
    status: 'aguardandoConfirmacao',
    statusHistory: [],
    subtotal: 50,
    deliveryFee: 5,
    discount: 0,
    total: 55,
    paymentMethod: 'cash',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function buildInput(overrides: Partial<OrderReceiptInput> = {}): OrderReceiptInput {
  return {
    restaurant: { name: 'Prime Pizza', slug: 'primepizza' },
    customer: { name: 'Ana' },
    order: buildOrder(),
    ...overrides,
  };
}

describe('buildOrderReceiptMessage', () => {
  it('AC-5: usa a saudação padrão quando o restaurante não configurou uma', () => {
    const message = buildOrderReceiptMessage(buildInput());
    expect(message).toContain('Obrigado por pedir com a gente, Ana!');
  });

  it('AC-5: usa a saudação customizada com {customerName} substituído', () => {
    const message = buildOrderReceiptMessage(
      buildInput({ restaurant: { name: 'Prime Pizza', slug: 'primepizza', orderConfirmationGreeting: 'Fala, {customerName}, valeu pelo pedido!' } }),
    );
    expect(message).toContain('Fala, Ana, valeu pelo pedido!');
  });

  it('AC-1/AC-6: inclui orderNumber e o link de acompanhamento com o trackingToken correto', () => {
    const message = buildOrderReceiptMessage(buildInput());
    expect(message).toContain('#123');
    expect(message).toContain('https://primepizza.bsdelivery.com.br/track?token=abc123');
  });

  it('AC-1: lista os itens com quantidade/preço e as seleções aninhadas', () => {
    const message = buildOrderReceiptMessage(buildInput());
    expect(message).toContain('2x X-Burger — R$ 50,00');
    expect(message).toContain('+ Grande (+R$ 5,00)');
    expect(message).toContain('+ Bem passado');
  });

  it('inclui dados de entrega quando orderType é delivery, com taxa de entrega', () => {
    const message = buildOrderReceiptMessage(buildInput());
    expect(message).toContain('Para: Ana');
    expect(message).toContain('Rua A, 123 - Centro');
    expect(message).toContain('Taxa de entrega: R$ 5,00');
  });

  it('omite dados de entrega quando orderType é pickup', () => {
    const message = buildOrderReceiptMessage(buildInput({ order: buildOrder({ orderType: 'pickup', deliveryFee: 0 }) }));
    expect(message).not.toContain('Taxa de entrega');
    expect(message).not.toContain('Rua A, 123');
    expect(message).toContain('Retirada no local.');
  });

  it('AC-7: bloco de pagamento com Pix mostra chave/tipo/beneficiário do restaurante', () => {
    const message = buildOrderReceiptMessage(
      buildInput({
        restaurant: {
          name: 'Prime Pizza',
          slug: 'primepizza',
          pixKey: '11999999999',
          pixKeyType: 'telefone',
          pixBeneficiaryName: 'Prime Pizza LTDA',
        },
        order: buildOrder({ paymentMethod: 'pix' }),
      }),
    );
    expect(message).toContain('Chave Pix (telefone): 11999999999');
    expect(message).toContain('Beneficiário: Prime Pizza LTDA');
    expect(message).toContain('não pelo app');
  });

  it('AC-7: bloco de pagamento com cartão mostra a operadora informada', () => {
    const message = buildOrderReceiptMessage(
      buildInput({ order: buildOrder({ paymentMethod: 'creditCard' }), cardBrand: 'Visa' }),
    );
    expect(message).toContain('Cartão de crédito (Visa)');
  });

  it('bloco de pagamento com dinheiro só mostra o método', () => {
    const message = buildOrderReceiptMessage(buildInput({ order: buildOrder({ paymentMethod: 'cash' }) }));
    expect(message).toContain('Forma: Dinheiro');
  });

  it('mostra o total e, quando houver desconto, a linha de desconto', () => {
    const message = buildOrderReceiptMessage(buildInput({ order: buildOrder({ discount: 10, total: 45 }) }));
    expect(message).toContain('Desconto: -R$ 10,00');
    expect(message).toContain('Total: R$ 45,00');
  });
});
