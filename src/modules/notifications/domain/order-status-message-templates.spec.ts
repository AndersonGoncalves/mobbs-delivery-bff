import { IOrder } from '../../orders/domain/entities/order.entity';
import { buildOrderStatusMessage, DEFAULT_ORDER_CONFIRMED_TEMPLATE, DEFAULT_OUT_FOR_DELIVERY_TEMPLATE, OrderStatusMessageInput } from './order-status-message-templates';

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
    restaurantSlug: 'primepizza',
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
        templates: { confirmado: 'Oi {nomeCliente}, pedido #{numeroPedido} confirmado! Total {total}, {tipoPedido}.\n{itens}\nTel: {telefoneCliente}' },
      }),
    );

    expect(message).toBe(
      'Oi Ana, pedido #123 confirmado! Total R$ 55,00, Entrega.\n2x X-Burger — R$ 50,00\nTel: 11999999999',
    );
  });

  it('"confirmado" com pedido de retirada usa o rótulo "Retirada" em {tipoPedido}', () => {
    const message = buildOrderStatusMessage(
      buildInput({ order: buildOrder({ orderType: 'pickup' }), templates: { confirmado: '{tipoPedido}' } }),
    );

    expect(message).toBe('Retirada');
  });

  it('"confirmado" sem customerPhone omite a linha que só tem {telefoneCliente} (specs/0069)', () => {
    const message = buildOrderStatusMessage(buildInput({ templates: { confirmado: 'Pedido {numeroPedido}\nTel: {telefoneCliente}' } }));

    expect(message).toBe('Pedido 123');
  });

  it('DEFAULT_ORDER_CONFIRMED_TEMPLATE é o texto usado quando nenhum template é configurado', () => {
    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ orderNumber: 999 }) }))).toBe(
      DEFAULT_ORDER_CONFIRMED_TEMPLATE.replace('{numeroPedido}', '999'),
    );
  });

  // specs/0065 AC-4 — sem template configurado, o texto é idêntico ao fixo de antes.
  it('specs/0065 AC-4: sem template configurado, "saiu para entrega" usa o texto fixo atual', () => {
    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ status: 'saiuParaEntrega' }) }))).toBe('🛵 Ana, seu pedido #123 saiu para entrega!\n\nMuito Obrigado Pela Preferência 😄');
    expect(DEFAULT_OUT_FOR_DELIVERY_TEMPLATE).toBe('🛵 {nomeCliente}, seu pedido #{numeroPedido} saiu para entrega!\n\nMuito Obrigado Pela Preferência 😄');
  });

  // specs/0065 AC-2.
  it('specs/0065 AC-2: "saiu para entrega" com template configurado substitui os placeholders', () => {
    const message = buildOrderStatusMessage(
      buildInput({
        order: buildOrder({ status: 'saiuParaEntrega' }),
        templates: { saiuParaEntrega: 'Oi {nomeCliente}! Pedido #{numeroPedido} a caminho: {linkAcompanhamento}' },
      }),
    );

    expect(message).toBe('Oi Ana! Pedido #123 a caminho: https://bsdelivery.com.br/primepizza/track?token=abc123');
  });

  it('specs/0065: template de "saiu para entrega" não interfere no de "confirmado" (e vice-versa)', () => {
    const templates = { confirmado: 'CONFIRMADO {numeroPedido}', saiuParaEntrega: 'SAIU {numeroPedido}' };

    expect(buildOrderStatusMessage(buildInput({ templates }))).toBe('CONFIRMADO 123');
    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ status: 'saiuParaEntrega' }), templates }))).toBe('SAIU 123');
  });

  it('texto de "saiu para entrega" antigo segue valendo (compat.)', () => {
    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ status: 'saiuParaEntrega' }) }))).toBe('🛵 Ana, seu pedido #123 saiu para entrega!\n\nMuito Obrigado Pela Preferência 😄');
  });

  it('texto de "em preparo"', () => {
    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ status: 'emPreparo' }) }))).toBe('Seu pedido #123 está sendo preparado.');
  });

  it('texto de "entregue"', () => {
    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ status: 'entregue' }) }))).toBe('Seu pedido #123 foi entregue. Bom apetite!');
  });

  it('cancelamento com motivo inclui o motivo', () => {
    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ status: 'cancelado' }), reason: 'sem estoque' }))).toBe(
      'Pedido #123 foi cancelado.\nMotivo: sem estoque',
    );
  });

  it('cancelamento sem motivo usa texto genérico', () => {
    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ status: 'cancelado' }) }))).toBe('Pedido #123 foi cancelado.');
  });

  it('status inicial (aguardandoConfirmacao) não gera mensagem de mudança de status', () => {
    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ status: 'aguardandoConfirmacao' }) }))).toBeNull();
  });

  // specs/0071.
  it('specs/0071: "em preparo" com template configurado substitui os placeholders', () => {
    const message = buildOrderStatusMessage(
      buildInput({ order: buildOrder({ status: 'emPreparo' }), templates: { emPreparo: 'Já estamos preparando o #{numeroPedido}, {nomeCliente}!' } }),
    );

    expect(message).toBe('Já estamos preparando o #123, Ana!');
  });

  it('specs/0071: "cancelado" com template usa {motivoCancelamento}', () => {
    const message = buildOrderStatusMessage(
      buildInput({
        order: buildOrder({ status: 'cancelado' }),
        reason: 'sem estoque',
        templates: { cancelado: 'Sentimos muito, {nomeCliente}. Pedido #{numeroPedido} cancelado ({motivoCancelamento}).' },
      }),
    );

    expect(message).toBe('Sentimos muito, Ana. Pedido #123 cancelado (sem estoque).');
  });

  it('specs/0071: "cancelado" sem motivo omite a linha "Motivo" do texto padrão', () => {
    const message = buildOrderStatusMessage(buildInput({ order: buildOrder({ status: 'cancelado' }) }));

    expect(message).toBe('Pedido #123 foi cancelado.');
    expect(message).not.toContain('Motivo');
  });

  it('specs/0071: cada status usa só o próprio template', () => {
    const templates = { confirmado: 'C', emPreparo: 'P', saiuParaEntrega: 'S', cancelado: 'X' };

    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ status: 'emPreparo' }), templates }))).toBe('P');
    expect(buildOrderStatusMessage(buildInput({ order: buildOrder({ status: 'cancelado' }), templates }))).toBe('X');
  });

  // specs/0086-mensagens-whatsapp-pedido-entregue-pagamento-confirmado — "entregue" passa a ser
  // parametrizável igual aos outros status (antes desta spec era o único com texto fixo cravado).
  it('specs/0086: "entregue" com template configurado substitui os placeholders', () => {
    const message = buildOrderStatusMessage(
      buildInput({ order: buildOrder({ status: 'entregue' }), templates: { entregue: 'Chegou, {nomeCliente}! Pedido #{numeroPedido} entregue.' } }),
    );

    expect(message).toBe('Chegou, Ana! Pedido #123 entregue.');
  });

  // Retirada: o passo "saiuParaEntrega" avisa que o pedido já pode ser retirado, nunca que saiu para entrega.
  it('retirada: no passo pronto, usa o texto de retirada (e não o de entrega)', () => {
    const message = buildOrderStatusMessage(buildInput({ order: buildOrder({ orderType: 'pickup', status: 'saiuParaEntrega' }) }));

    expect(message).toBe('Seu pedido #123 já está pronto! Você já pode retirar no restaurante.');
  });

  it('retirada: o template de retirada do restaurante, quando configurado, tem prioridade', () => {
    const message = buildOrderStatusMessage(
      buildInput({
        order: buildOrder({ orderType: 'pickup', status: 'saiuParaEntrega' }),
        templates: { readyForPickup: 'Pedido #{numeroPedido} pronto na balcão!' },
      }),
    );

    expect(message).toBe('Pedido #123 pronto na balcão!');
  });

  it('entrega continua usando o texto de "saiu para entrega"', () => {
    const message = buildOrderStatusMessage(buildInput({ order: buildOrder({ orderType: 'delivery', status: 'saiuParaEntrega' }) }));

    expect(message).toBe('🛵 Ana, seu pedido #123 saiu para entrega!\n\nMuito Obrigado Pela Preferência 😄');
  });
});
