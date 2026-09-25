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
    restaurant: { slug: 'primepizza' },
    customer: { name: 'Ana' },
    order: buildOrder(),
    ...overrides,
  };
}

describe('buildOrderReceiptMessage', () => {
  // specs/0072 — a saudação virou a 1ª linha do template padrão (não há mais campo separado).
  it('a 1ª linha do recibo padrão é o agradecimento com o nome do cliente', () => {
    const message = buildOrderReceiptMessage(buildInput());
    expect(message.split('\n')[0]).toBe('Obrigado por pedir com a gente, Ana!');
  });

  it('AC-1/AC-6: inclui orderNumber e o link de acompanhamento com o trackingToken correto', () => {
    const message = buildOrderReceiptMessage(buildInput());
    expect(message).toContain('#123');
    expect(message).toContain('https://bsdelivery.com.br/primepizza/track?token=abc123');
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

  it('specs/0069/0073: Pix avisa que o copia-e-cola vem na mensagem abaixo e NUNCA mostra a chave Pix crua nem o beneficiário', () => {
    const message = buildOrderReceiptMessage(
      buildInput({ order: buildOrder({ paymentMethod: 'pix' }), pixCode: '00020126...6304ABCD' }),
    );

    expect(message).toContain('Forma: Pix');
    // specs/0073 — o código vai numa 2ª mensagem; o recibo só avisa.
    expect(message).toContain('Pix copia e cola: na mensagem abaixo 👇');
    expect(message).not.toContain('00020126...6304ABCD');
    expect(message).not.toContain('Chave Pix');
    expect(message).not.toContain('Beneficiário');
  });

  it('specs/0069: Pix sem copia-e-cola disponível mostra só a forma de pagamento', () => {
    const message = buildOrderReceiptMessage(buildInput({ order: buildOrder({ paymentMethod: 'pix' }) }));

    expect(message).toContain('Forma: Pix');
    expect(message).not.toContain('copia e cola');
  });

  it('specs/0020-pix-no-app AC-5/REQ-7: Pix não mostra mais "pagamento é feito na entrega/retirada, não pelo app" (deixou de ser verdade — processado dentro do app)', () => {
    const deliveryMessage = buildOrderReceiptMessage(
      buildInput({
        restaurant: { slug: 'primepizza' },
        order: buildOrder({ paymentMethod: 'pix', orderType: 'delivery' }),
      }),
    );
    const pickupMessage = buildOrderReceiptMessage(
      buildInput({
        restaurant: { slug: 'primepizza' },
        order: buildOrder({ paymentMethod: 'pix', orderType: 'pickup' }),
      }),
    );

    expect(deliveryMessage).not.toContain('não pelo app');
    expect(deliveryMessage).not.toContain('pagamento é feito na entrega');
    expect(pickupMessage).not.toContain('não pelo app');
    expect(pickupMessage).not.toContain('pagamento é feito na retirada');
  });

  it('specs/0020-pix-no-app AC-5/REQ-7: outros métodos de pagamento continuam mostrando a frase normalmente', () => {
    const cashMessage = buildOrderReceiptMessage(buildInput({ order: buildOrder({ paymentMethod: 'cash', orderType: 'delivery' }) }));
    const cardMessage = buildOrderReceiptMessage(
      buildInput({ order: buildOrder({ paymentMethod: 'creditCard', orderType: 'pickup' }), cardBrand: 'Visa' }),
    );
    const bankTransferMessage = buildOrderReceiptMessage(buildInput({ order: buildOrder({ paymentMethod: 'bankTransfer' }) }));

    expect(cashMessage).toContain('O pagamento é feito na entrega, não pelo app.');
    expect(cardMessage).toContain('O pagamento é feito na retirada, não pelo app.');
    expect(bankTransferMessage).toContain('não pelo app');
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

describe('buildOrderReceiptMessage — template editável (specs/0069)', () => {
  it('template customizado usa os placeholders em português', () => {
    const message = buildOrderReceiptMessage(
      buildInput({ restaurant: { slug: 'primepizza', orderReceiptWhatsAppTemplate: 'Oi {nomeCliente}!\nPedido {numeroPedido} — {total}\n{linkAcompanhamento}' } }),
    );

    expect(message).toBe(
      'Oi Ana!\nPedido 123 — R$ 55,00\nhttps://bsdelivery.com.br/primepizza/track?token=abc123',
    );
  });

  it('linhas opcionais (Previsão/Desconto) somem quando não há valor', () => {
    const message = buildOrderReceiptMessage(buildInput());

    expect(message).not.toContain('Previsão');
    expect(message).not.toContain('Desconto');
    expect(message).not.toContain('{');
  });

  it('com previsão de entrega, a linha "Previsão" aparece', () => {
    const message = buildOrderReceiptMessage(buildInput({ order: buildOrder({ estimatedDeliveryAt: '2026-09-25T20:30:00.000Z' }) }));

    expect(message).toContain('Previsão:');
  });
});
