import { IPromotion } from './entities/promotion.entity';
import { computePromotionalPrice, isPromotionCurrentlyActive } from './promotion-pricing';

function buildPromotion(overrides: Partial<IPromotion> = {}): IPromotion {
  return {
    id: 'promo-1',
    restaurantId: 'r-1',
    name: 'Promoção de terça',
    discountPercentage: 20,
    productIds: ['p-1'],
    isActive: true,
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-09-30T23:59:59.000Z',
    createdAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('isPromotionCurrentlyActive (specs/0044-promocoes-produtos REQ-7)', () => {
  it('AC-2: isActive:true e dentro da janela -> ativa', () => {
    const promotion = buildPromotion();
    expect(isPromotionCurrentlyActive(promotion, new Date('2026-09-15T12:00:00.000Z'))).toBe(true);
  });

  it('isActive:false, mesmo dentro da janela -> inativa (REQ-6 tem prioridade)', () => {
    const promotion = buildPromotion({ isActive: false });
    expect(isPromotionCurrentlyActive(promotion, new Date('2026-09-15T12:00:00.000Z'))).toBe(false);
  });

  it('AC-6: antes de startDate -> inativa, mesmo com isActive:true', () => {
    const promotion = buildPromotion();
    expect(isPromotionCurrentlyActive(promotion, new Date('2026-08-30T00:00:00.000Z'))).toBe(false);
  });

  it('AC-7: depois de endDate -> inativa, mesmo com isActive:true', () => {
    const promotion = buildPromotion();
    expect(isPromotionCurrentlyActive(promotion, new Date('2026-10-01T00:00:00.000Z'))).toBe(false);
  });
});

describe('computePromotionalPrice (specs/0044-promocoes-produtos REQ-2)', () => {
  it('AC-2: R$ 50,00 com 20% de desconto -> R$ 40,00', () => {
    expect(computePromotionalPrice(50, 20)).toBe(40);
  });

  it('AC-8: R$ 10,00 (priceDelta de opção vinculada) com 20% -> R$ 8,00', () => {
    expect(computePromotionalPrice(10, 20)).toBe(8);
  });

  it('arredonda a 2 casas decimais', () => {
    expect(computePromotionalPrice(19.99, 33)).toBe(13.39);
  });

  it('100% de desconto -> preço zero', () => {
    expect(computePromotionalPrice(50, 100)).toBe(0);
  });
});
