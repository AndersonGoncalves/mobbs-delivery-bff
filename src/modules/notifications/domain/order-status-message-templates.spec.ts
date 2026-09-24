import { IOrder } from '../../orders/domain/entities/order.entity';
import { buildOrderStatusMessage, DEFAULT_ORDER_CONFIRMED_TEMPLATE, OrderStatusMessageInput } from './order-status-message-templates';

function buildOrder(overrides: Partial<IOrder> = {}): IOrder {
  return {
    id: 'o-1',
    orderNumber: 123,
    trackingToken: 'abc123',
    customerId: 'c-1',
    restaurantId: 'r-1',
    items: [{ id: 'i-1', productId: 'p-1', productName: 'X-Burger', quantity: 2, unitPrice: 25 }],
    orderType: 'delivery',
    deliveryAddress: 'Rua A, 123',
    status: 'confirmado',
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

function buildInput(overrides: Partial<OrderStatusMessageInput> = {}): OrderStatusMessageInput {
  return {
    order: buildOrder(),
    customerName: 'Ana',
    templates: {},
    ...overrides,
  };
}

describe('buildOrderStatusMessage', () => {
  // specs/0063-notificacao-whatsapp-pedido-confirmado AC-4 — sem template configurado, o texto é
  // idêntico ao fixo já usado antes desta spec (retrocompatibilidade).
  it('AC-2/AC-4: sem template configurado, "confirmado" usa o texto fixo atual', () => {
    expect(buildOrderStatusMessage(buildInput())).toBe('Seu pedido #123 foi confirmado pelo restaurante!');
  });

  // specs/0063-notificacao-whatsapp-pedido-confirmado AC-2.
  it('AC-2: "confirmado" com template configurado substitui os placeholders pelos dados reais', () => {
    const message = buildOrderStatusMessage(
      buildInput({
        customerName: 'Ana',
        customerPhone: '11999999999',
        templates: { confirmado: 'Oi {customerName}, pedido #{orderNumber} confirmado! Total {total}, {orderTypeLabel}.\n{items}\nTel: {customerPhone}' },
      }),
    );

    expect(message).toBe(
      'Oi Ana, pedido #123 confirmado! Total R$ 55,00, Entrega.\n2x X-Burger — R$ 50,00\nTel: 11999999999',
    );
  });

  it('"confirmado" com pedido de retirada usa o rótulo "Retirada" em {orderTypeLabel}', () => {
    const message = buildOrderStatusMessage(
      buildInput({ order: buildOrder({ orderType: 'pickup' }), templates: { confirmado: '{orderTypeLabel}' } }),
    );

    expect(message).toBe('Retirada');
  });

  it('"confirmado" sem customerPhone substitui {customerPhone} por vazio, sem quebrar', () => {
    const message = buildOrderStatusMessage(buildInput({ templates: { confirmado: 'Tel: [{customerPhone}]' } }));

    expect(message).toBe('Tel: []');
  });

  it('DEFAULT_ORDER_CONFIRMED_TEMPLATE é o texto usado quando nenhum template é configurado', () => {
    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ orderNumber: 999 }) }))).toBe(
      DEFAULT_ORDER_CONFIRMED_TEMPLATE.replace('{orderNumber}', '999'),
    );
  });

  it('texto de "saiu para entrega"', () => {
    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ status: 'saiuParaEntrega' }) }))).toBe('Seu pedido #123 saiu para entrega!');
  });

  it('texto de "em preparo"', () => {
    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ status: 'emPreparo' }) }))).toBe('Seu pedido #123 está sendo preparado.');
  });

  it('texto de "entregue"', () => {
    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ status: 'entregue' }) }))).toBe('Seu pedido #123 foi entregue. Bom apetite!');
  });

  it('cancelamento com motivo inclui o motivo', () => {
    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ status: 'cancelado' }), reason: 'sem estoque' }))).toBe(
      'Pedido #123 cancelado: sem estoque',
    );
  });

  it('cancelamento sem motivo usa texto genérico', () => {
    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ status: 'cancelado' }) }))).toBe('Pedido #123 foi cancelado.');
  });

  it('status inicial (aguardandoConfirmacao) não gera mensagem de mudança de status', () => {
    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ status: 'aguardandoConfirmacao' }) }))).toBeNull();
  });
});
