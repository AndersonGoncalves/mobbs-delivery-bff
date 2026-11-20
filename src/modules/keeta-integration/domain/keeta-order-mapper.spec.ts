import { KeetaOrderInfo, mapKeetaOrderToNewOrderInput } from './keeta-order-mapper';

function buildOrderInfo(overrides: Partial<KeetaOrderInfo> = {}): KeetaOrderInfo {
  return {
    baseOrder: { orderViewId: '756823555555859', remark: 'Sem cebola' },
    merchantOrder: { status: 10, userGetMode: 'delivery' },
    recipientInfo: { name: 'Maria', phone: '11999990000', addressName: 'Rua das Flores, 123' },
    feeDtl: { customerFee: 5500, merchantFee: 5000 },
    products: [{ name: 'Pizza Calabresa', skuId: 'sku-1', count: 1, price: 5500, remark: 'Sem cebola' }],
    ...overrides,
  };
}

describe('mapKeetaOrderToNewOrderInput', () => {
  it('mapeia pedido de entrega com itens, endereço e total do customerFee', () => {
    const input = mapKeetaOrderToNewOrderInput(buildOrderInfo(), 'r-1', 'c-1');

    expect(input.source).toBe('keeta');
    expect(input.keetaOrderViewId).toBe('756823555555859');
    expect(input.orderType).toBe('delivery');
    expect(input.deliveryAddress).toBe('Rua das Flores, 123');
    expect(input.total).toBe(5500);
    expect(input.items).toEqual([
      { id: 'sku-1', productId: 'sku-1', productName: 'Pizza Calabresa', quantity: 1, unitPrice: 5500, notes: 'Sem cebola' },
    ]);
    expect(input.paymentMethod).toBe('creditCardOnline');
  });

  it('mapeia pedido de retirada (userGetMode pickup)', () => {
    const input = mapKeetaOrderToNewOrderInput(buildOrderInfo({ merchantOrder: { status: 10, userGetMode: 'pickup' } }), 'r-1', 'c-1');
    expect(input.orderType).toBe('pickup');
  });

  it('usa merchantFee se customerFee não vier (shape defensivo)', () => {
    const input = mapKeetaOrderToNewOrderInput(buildOrderInfo({ feeDtl: { merchantFee: 4200 } }), 'r-1', 'c-1');
    expect(input.total).toBe(4200);
  });

  it('nunca lança se products vier ausente ou com campos faltando (shape real não documentado)', () => {
    expect(() => mapKeetaOrderToNewOrderInput(buildOrderInfo({ products: undefined }), 'r-1', 'c-1')).not.toThrow();
    const input = mapKeetaOrderToNewOrderInput(buildOrderInfo({ products: [{}] }), 'r-1', 'c-1');
    expect(input.items).toEqual([{ id: 'keeta-item-0', productId: 'keeta-item-0', productName: 'Item sem nome', quantity: 1, unitPrice: 0, notes: undefined }]);
  });

  it('nunca lança se addressStruct vier malformado, só fica sem endereço estruturado', () => {
    const input = mapKeetaOrderToNewOrderInput(
      buildOrderInfo({ recipientInfo: { addressStruct: '{not-json' } }),
      'r-1',
      'c-1',
    );
    expect(input.deliveryAddress).toBeUndefined();
  });
});
