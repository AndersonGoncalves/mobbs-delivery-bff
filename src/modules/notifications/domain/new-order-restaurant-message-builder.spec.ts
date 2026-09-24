import { IOrder } from '../../orders/domain/entities/order.entity';
import { buildNewOrderRestaurantMessage, DEFAULT_NEW_ORDER_RESTAURANT_TEMPLATE, NewOrderRestaurantMessageInput } from './new-order-restaurant-message-builder';

function buildOrder(overrides: Partial<IOrder> = {}): IOrder {
  return {
    id: 'o-1',
    orderNumber: 123,
    trackingToken: 'abc123',
    customerId: 'c-1',
    restaurantId: 'r-1',
    items: [
      { id: 'i-1', productId: 'p-1', productName: 'X-Burger', quantity: 2, unitPrice: 25 },
      { id: 'i-2', productId: 'p-2', productName: 'Refrigerante', quantity: 1, unitPrice: 8 },
    ],
    orderType: 'delivery',
    deliveryAddress: 'Rua A, 123 - Centro',
    status: 'aguardandoConfirmacao',
    statusHistory: [],
    subtotal: 58,
    deliveryFee: 5,
    discount: 0,
    total: 63,
    paymentMethod: 'pix',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function buildInput(overrides: Partial<NewOrderRestaurantMessageInput> = {}): NewOrderRestaurantMessageInput {
  return {
    template: DEFAULT_NEW_ORDER_RESTAURANT_TEMPLATE,
    order: buildOrder(),
    customerName: 'Ana',
    restaurantSlug: 'primepizza',
    ...overrides,
  };
}

describe('buildNewOrderRestaurantMessage', () => {
  it('AC-4: substitui todos os placeholders do template default pelos dados reais do pedido', () => {
    const message = buildNewOrderRestaurantMessage(buildInput());

    expect(message).toContain('Pedido #123');
    expect(message).toContain('Cliente: Ana');
    expect(message).toContain('2x X-Burger — R$ 50,00');
    expect(message).toContain('1x Refrigerante — R$ 8,00');
    expect(message).toContain('Subtotal: R$ 58,00');
    expect(message).toContain('Endereço: Rua A, 123 - Centro');
    expect(message).toContain('Taxa de entrega: R$ 5,00');
    expect(message).toContain('Total: R$ 63,00');
    expect(message).toContain('Pagamento: Pix');
    expect(message).toContain('Acompanhar: https://primepizza.bsdelivery.com.br/track?token=abc123');
    expect(message).not.toContain('{');
  });

  it('retirada no local não mostra endereço/taxa de entrega', () => {
    const message = buildNewOrderRestaurantMessage(buildInput({ order: buildOrder({ orderType: 'pickup', deliveryAddress: undefined, deliveryFee: 0 }) }));

    expect(message).toContain('Retirada no local.');
    expect(message).not.toContain('Endereço:');
  });

  it('endereço ausente (delivery) mostra "não informado"', () => {
    const message = buildNewOrderRestaurantMessage(buildInput({ order: buildOrder({ deliveryAddress: undefined }) }));

    expect(message).toContain('Endereço: não informado');
  });

  it('cada método de pagamento vira o rótulo certo, sem reafirmar a chave Pix do restaurante', () => {
    const template = 'Pagamento: {paymentMethod}';

    expect(buildNewOrderRestaurantMessage(buildInput({ template, order: buildOrder({ paymentMethod: 'pix' }) }))).toBe('Pagamento: Pix');
    expect(buildNewOrderRestaurantMessage(buildInput({ template, order: buildOrder({ paymentMethod: 'creditCard' }) }))).toBe('Pagamento: Cartão de crédito');
    expect(buildNewOrderRestaurantMessage(buildInput({ template, order: buildOrder({ paymentMethod: 'debitCard' }) }))).toBe('Pagamento: Cartão de débito');
    expect(buildNewOrderRestaurantMessage(buildInput({ template, order: buildOrder({ paymentMethod: 'cash' }) }))).toBe('Pagamento: Dinheiro');
    expect(buildNewOrderRestaurantMessage(buildInput({ template, order: buildOrder({ paymentMethod: 'bankTransfer' }) }))).toBe('Pagamento: Transferência bancária');
  });

  it('template customizado (restaurante editou na retaguarda) também tem os placeholders substituídos', () => {
    const message = buildNewOrderRestaurantMessage(buildInput({ template: 'Oi! Pedido #{orderNumber} de {customerName}, total {total}.' }));

    expect(message).toBe('Oi! Pedido #123 de Ana, total R$ 63,00.');
  });

  it('{estimatedDelivery} vira "não informada" quando o pedido não tem previsão', () => {
    const message = buildNewOrderRestaurantMessage(buildInput({ template: 'Previsão: {estimatedDelivery}', order: buildOrder({ estimatedDeliveryAt: undefined }) }));

    expect(message).toBe('Previsão: não informada');
  });
});
