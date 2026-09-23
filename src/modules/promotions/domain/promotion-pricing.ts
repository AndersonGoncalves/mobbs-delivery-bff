import { IPromotion } from './entities/promotion.entity';

/**
 * specs/0044-promocoes-produtos REQ-7/AC-6/AC-7 — "efetivamente ativa" exige os dois: o toggle
 * manual (REQ-6, `isActive`) E estar dentro da janela `[startDate, endDate]`. Fora da janela
 * (ainda não começou, ou já terminou) o produto volta ao preço base mesmo com `isActive: true`
 * — o operador não precisa lembrar de desativar manualmente ao fim da promoção.
 */
export function isPromotionCurrentlyActive(promotion: IPromotion, now: Date): boolean {
  if (!promotion.isActive) return false;
  const start = new Date(promotion.startDate);
  const end = new Date(promotion.endDate);
  return now >= start && now <= end;
}

/**
 * specs/0044-promocoes-produtos REQ-2 — `price * (1 - discountPercentage / 100)`, arredondado a
 * 2 casas (mesma precisão monetária do resto do sistema, sem trabalhar em centavos inteiros
 * aqui — `Product.price`/`IProductAdditionalOption.priceDelta` já são `number` em reais).
 */
export function computePromotionalPrice(price: number, discountPercentage: number): number {
  return Math.round(price * (1 - discountPercentage / 100) * 100) / 100;
}
