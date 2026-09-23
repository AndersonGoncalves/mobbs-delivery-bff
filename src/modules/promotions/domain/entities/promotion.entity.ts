/**
 * specs/0044-promocoes-produtos REQ-1/REQ-7 — desconto percentual sobre um ou mais produtos, com
 * janela de vigência (`startDate`/`endDate`) e toggle manual (`isActive`, REQ-6) independente
 * dela — os dois precisam valer ao mesmo tempo pra promoção estar "efetivamente ativa"
 * (`isPromotionCurrentlyActive`, `promotion-pricing.ts`). `startDate`/`endDate` como `string`
 * (ISO), mesmo padrão de `ICoupon.validFrom`/`validUntil`.
 */
export interface IPromotion {
  id: string;
  restaurantId: string;
  name: string;
  discountPercentage: number;
  productIds: string[];
  isActive: boolean;
  startDate: string;
  endDate: string;
  createdAt: string;
}
