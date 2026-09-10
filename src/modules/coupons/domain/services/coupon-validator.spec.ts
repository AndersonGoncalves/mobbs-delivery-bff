import { ICoupon } from '../entities/coupon.entity';
import { validateCoupon } from './coupon-validator';

function buildCoupon(overrides: Partial<ICoupon> = {}): ICoupon {
  return {
    id: 'c-1',
    restaurantId: 'r-1',
    code: 'PROMO10',
    discountType: 'percentual',
    discountValue: 10,
    validFrom: '2026-01-01T00:00:00.000Z',
    usageCount: 0,
    isActive: true,
    ...overrides,
  };
}

const NOW = new Date('2026-09-10T12:00:00.000Z');

describe('validateCoupon (specs/0022-cupons-desconto REQ-2/REQ-3/REQ-6)', () => {
  it('AC-2: cupom percentual válido aplica o desconto correto sobre o subtotal', () => {
    const result = validateCoupon({
      coupon: buildCoupon({ discountType: 'percentual', discountValue: 10 }),
      orderSubtotal: 100,
      now: NOW,
      customerUsageCount: 0,
    });

    expect(result).toEqual({ valid: true, discountAmount: 10 });
  });

  it('AC-2: cupom de valor fixo válido aplica o valor fixo', () => {
    const result = validateCoupon({
      coupon: buildCoupon({ discountType: 'fixo', discountValue: 5 }),
      orderSubtotal: 50,
      now: NOW,
      customerUsageCount: 0,
    });

    expect(result).toEqual({ valid: true, discountAmount: 5 });
  });

  it('cupom de valor fixo maior que o subtotal nunca desconta mais que o próprio subtotal (total nunca negativo)', () => {
    const result = validateCoupon({
      coupon: buildCoupon({ discountType: 'fixo', discountValue: 999 }),
      orderSubtotal: 30,
      now: NOW,
      customerUsageCount: 0,
    });

    expect(result).toEqual({ valid: true, discountAmount: 30 });
  });

  it('AC-3: código inexistente (coupon null) retorna motivo específico, sem desconto', () => {
    const result = validateCoupon({ coupon: null, orderSubtotal: 100, now: NOW, customerUsageCount: 0 });

    expect(result).toEqual({ valid: false, reason: 'Cupom não encontrado' });
  });

  it('AC-3: cupom inativo é rejeitado com motivo específico', () => {
    const result = validateCoupon({
      coupon: buildCoupon({ isActive: false }),
      orderSubtotal: 100,
      now: NOW,
      customerUsageCount: 0,
    });

    expect(result).toEqual({ valid: false, reason: 'Cupom inativo' });
  });

  it('AC-3: cupom fora da validade (ainda não começou) é rejeitado', () => {
    const result = validateCoupon({
      coupon: buildCoupon({ validFrom: '2027-01-01T00:00:00.000Z' }),
      orderSubtotal: 100,
      now: NOW,
      customerUsageCount: 0,
    });

    expect(result).toEqual({ valid: false, reason: 'Cupom ainda não está válido' });
  });

  it('AC-3: cupom expirado (validUntil no passado) é rejeitado', () => {
    const result = validateCoupon({
      coupon: buildCoupon({ validUntil: '2026-01-31T23:59:59.000Z' }),
      orderSubtotal: 100,
      now: NOW,
      customerUsageCount: 0,
    });

    expect(result).toEqual({ valid: false, reason: 'Cupom expirado' });
  });

  it('cupom dentro da validade (validUntil no futuro) passa nessa checagem', () => {
    const result = validateCoupon({
      coupon: buildCoupon({ validUntil: '2027-01-01T00:00:00.000Z' }),
      orderSubtotal: 100,
      now: NOW,
      customerUsageCount: 0,
    });

    expect(result.valid).toBe(true);
  });

  it('AC-3: pedido abaixo do valor mínimo é rejeitado com o valor mínimo na mensagem', () => {
    const result = validateCoupon({
      coupon: buildCoupon({ minOrderValue: 50 }),
      orderSubtotal: 30,
      now: NOW,
      customerUsageCount: 0,
    });

    expect(result).toEqual({ valid: false, reason: 'Pedido mínimo de R$ 50.00 para usar este cupom' });
  });

  it('pedido exatamente no valor mínimo é aceito (não exige estritamente maior)', () => {
    const result = validateCoupon({
      coupon: buildCoupon({ minOrderValue: 50 }),
      orderSubtotal: 50,
      now: NOW,
      customerUsageCount: 0,
    });

    expect(result.valid).toBe(true);
  });

  it('AC-4: limite de uso total já atingido é rejeitado', () => {
    const result = validateCoupon({
      coupon: buildCoupon({ usageLimit: 1, usageCount: 1 }),
      orderSubtotal: 100,
      now: NOW,
      customerUsageCount: 0,
    });

    expect(result).toEqual({ valid: false, reason: 'Cupom atingiu o limite de uso' });
  });

  it('limite de uso total ainda disponível passa nessa checagem', () => {
    const result = validateCoupon({
      coupon: buildCoupon({ usageLimit: 5, usageCount: 4 }),
      orderSubtotal: 100,
      now: NOW,
      customerUsageCount: 0,
    });

    expect(result.valid).toBe(true);
  });

  it('AC-6: limite por cliente atingido é rejeitado mesmo com limite total do cupom disponível', () => {
    const result = validateCoupon({
      coupon: buildCoupon({ usageLimit: 100, usageCount: 1, usageLimitPerCustomer: 1 }),
      orderSubtotal: 100,
      now: NOW,
      customerUsageCount: 1,
    });

    expect(result).toEqual({ valid: false, reason: 'Você já usou esse cupom o número máximo de vezes permitido' });
  });

  it('limite por cliente ainda não atingido passa nessa checagem', () => {
    const result = validateCoupon({
      coupon: buildCoupon({ usageLimitPerCustomer: 2 }),
      orderSubtotal: 100,
      now: NOW,
      customerUsageCount: 1,
    });

    expect(result.valid).toBe(true);
  });
});
