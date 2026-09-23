import { IPromotion } from './entities/promotion.entity';
import { findConflictingProductIds } from './find-conflicting-product-ids';

function buildPromotion(overrides: Partial<IPromotion> = {}): IPromotion {
  return {
    id: 'promo-1',
    restaurantId: 'r-1',
    name: 'Outra promoção',
    discountPercentage: 10,
    productIds: ['p-1', 'p-2'],
    isActive: true,
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-09-30T23:59:59.000Z',
    createdAt: '2026-08-25T00:00:00.000Z',
    ...overrides,
  };
}

describe('findConflictingProductIds (specs/0044-promocoes-produtos REQ-1/AC-5)', () => {
  it('devolve os ids que já estão em outra promoção ativa', () => {
    const conflicting = findConflictingProductIds(['p-2', 'p-3'], [buildPromotion()]);
    expect(conflicting).toEqual(['p-2']);
  });

  it('sem sobreposição nenhuma -> lista vazia', () => {
    const conflicting = findConflictingProductIds(['p-3', 'p-4'], [buildPromotion()]);
    expect(conflicting).toEqual([]);
  });

  it('sem nenhuma outra promoção ativa -> lista vazia', () => {
    expect(findConflictingProductIds(['p-1'], [])).toEqual([]);
  });
});
