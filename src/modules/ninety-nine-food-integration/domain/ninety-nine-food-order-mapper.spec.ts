import { mapNinetyNineFoodOrderToNewOrderInput, NinetyNineFoodOrderInfo } from './ninety-nine-food-order-mapper';

function buildOrderInfo(overrides: Partial<NinetyNineFoodOrderInfo> = {}): NinetyNineFoodOrderInfo {
  return {
    order_id: '5764656197621845665',
    fulfillment_mode: 0,
    remark: 'sem cebola',
    price: {
      order_price: 2000,
      delivery_price: 500,
      real_pay_price: 2500,
      items_discount: 0,
      delivery_discount: 0,
    },
    receive_address: {
      name: 'Ana',
      phone: '11999998888',
      poi_address: 'R. Congonhas, 405 - Belo Horizonte - MG',
    },
    order_items: [{ app_item_id: 'item-1', name: 'X-Burguer', amount: 2, sku_price: 1000, remark: 'sem cebola' }],
    ...overrides,
  };
}

describe('mapNinetyNineFoodOrderToNewOrderInput (specs/0122-integracao-99food REQ-4)', () => {
  it('mapeia pedido de delivery com todos os campos', () => {
    const input = mapNinetyNineFoodOrderToNewOrderInput(buildOrderInfo(), 'restaurant-1', 'customer-1');

    expect(input).toMatchObject({
      customerId: 'customer-1',
      restaurantId: 'restaurant-1',
      orderType: 'delivery',
      source: '99food',
      ninetyNineFoodOrderId: '5764656197621845665',
      deliveryAddress: 'R. Congonhas, 405 - Belo Horizonte - MG',
      subtotal: 2000,
      deliveryFee: 500,
      discount: 0,
      total: 2500,
      paymentMethod: 'creditCardOnline',
      notes: 'sem cebola',
    });
    expect(input.items).toEqual([
      { id: 'item-1', productId: 'item-1', productName: 'X-Burguer', quantity: 2, unitPrice: 1000, notes: 'sem cebola' },
    ]);
  });

  it('fulfillment_mode 1 (self-pickup) mapeia pra orderType pickup', () => {
    const input = mapNinetyNineFoodOrderToNewOrderInput(buildOrderInfo({ fulfillment_mode: 1 }), 'restaurant-1', 'customer-1');

    expect(input.orderType).toBe('pickup');
  });

  it('sem real_pay_price, usa customer_need_paying_money como total', () => {
    const orderInfo = buildOrderInfo({
      price: { order_price: 2000, customer_need_paying_money: 2300, items_discount: 0, delivery_discount: 0 },
    });

    const input = mapNinetyNineFoodOrderToNewOrderInput(orderInfo, 'restaurant-1', 'customer-1');

    expect(input.total).toBe(2300);
  });

  it('sem real_pay_price nem customer_need_paying_money, usa order_price como total', () => {
    const orderInfo = buildOrderInfo({ price: { order_price: 2000, items_discount: 0, delivery_discount: 0 } });

    const input = mapNinetyNineFoodOrderToNewOrderInput(orderInfo, 'restaurant-1', 'customer-1');

    expect(input.total).toBe(2000);
  });

  it('soma items_discount + delivery_discount em discount', () => {
    const orderInfo = buildOrderInfo({ price: { order_price: 2000, items_discount: 100, delivery_discount: 50, real_pay_price: 2500 } });

    const input = mapNinetyNineFoodOrderToNewOrderInput(orderInfo, 'restaurant-1', 'customer-1');

    expect(input.discount).toBe(150);
  });

  it('nunca gera um pedido de mesa (fulfillment_mode só tem 0/1)', () => {
    const input = mapNinetyNineFoodOrderToNewOrderInput(buildOrderInfo(), 'restaurant-1', 'customer-1');

    expect(input.orderType).not.toBe('table');
  });
});
