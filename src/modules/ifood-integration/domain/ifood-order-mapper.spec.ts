import { mapIFoodOrderToNewOrderInput } from './ifood-order-mapper';
import { IFoodOrderDetails } from '../infra/ifood-client';

function buildIFoodOrder(overrides: Partial<IFoodOrderDetails> = {}): IFoodOrderDetails {
  return {
    id: 'ifood-o-1',
    displayId: '123',
    orderType: 'DELIVERY',
    customer: { name: 'Ana', phone: '11999999999' },
    items: [
      { id: 'i-1', name: 'Pizza', quantity: 1, unitPrice: { value: 40 }, totalPrice: { value: 40 } },
      { id: 'i-2', name: 'Refrigerante', quantity: 2, unitPrice: { value: 5 }, totalPrice: { value: 10 } },
    ],
    total: { orderAmount: { value: 55 }, deliveryFee: { value: 5 } },
    delivery: { deliveryAddress: { formattedAddress: 'Rua A, 123' } },
    ...overrides,
  };
}

describe('mapIFoodOrderToNewOrderInput (specs/0090-integracao-ifood REQ-3)', () => {
  it('mapeia itens, valores e endereço do payload do iFood', () => {
    const result = mapIFoodOrderToNewOrderInput(buildIFoodOrder(), 'r-1', 'cust-1');

    expect(result).toMatchObject({
      restaurantId: 'r-1',
      customerId: 'cust-1',
      orderType: 'delivery',
      source: 'ifood',
      deliveryAddress: 'Rua A, 123',
      subtotal: 50,
      deliveryFee: 5,
      discount: 0,
      total: 55,
      paymentMethod: 'creditCardOnline',
    });
    expect(result.items).toEqual([
      { id: 'i-1', productId: 'i-1', productName: 'Pizza', quantity: 1, unitPrice: 40, notes: undefined },
      { id: 'i-2', productId: 'i-2', productName: 'Refrigerante', quantity: 2, unitPrice: 5, notes: undefined },
    ]);
  });

  it('TAKEOUT do iFood vira orderType "pickup"', () => {
    const result = mapIFoodOrderToNewOrderInput(buildIFoodOrder({ orderType: 'TAKEOUT' }), 'r-1', 'cust-1');

    expect(result.orderType).toBe('pickup');
  });
});
