import { computeOrderPricing } from './compute-order-pricing';

describe('computeOrderPricing', () => {
  it('AC-6 (specs/0155): soma unitPrice*quantity de cada item pro subtotal, nunca aceita um total pronto', () => {
    const result = computeOrderPricing({
      items: [
        { unitPrice: 10, quantity: 2 },
        { unitPrice: 5.5, quantity: 1 },
      ],
      deliveryFee: 0,
      discount: 0,
      cashbackUsed: 0,
    });

    expect(result.subtotal).toBe(25.5);
    expect(result.total).toBe(25.5);
  });

  it('total = subtotal + deliveryFee - discount - cashbackUsed', () => {
    const result = computeOrderPricing({
      items: [{ unitPrice: 20, quantity: 1 }],
      deliveryFee: 6,
      discount: 4,
      cashbackUsed: 2,
    });

    expect(result.subtotal).toBe(20);
    expect(result.total).toBe(20);
  });

  it('pedido do totem (specs/0155): sem taxa de entrega/desconto/cashback, total == subtotal', () => {
    const result = computeOrderPricing({
      items: [
        { unitPrice: 12.9, quantity: 2 },
        { unitPrice: 8, quantity: 3 },
      ],
      deliveryFee: 0,
      discount: 0,
      cashbackUsed: 0,
    });

    expect(result.subtotal).toBeCloseTo(49.8, 5);
    expect(result.total).toBeCloseTo(49.8, 5);
  });
});
