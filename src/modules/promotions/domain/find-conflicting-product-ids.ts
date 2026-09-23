import { IPromotion } from './entities/promotion.entity';

/**
 * specs/0044-promocoes-produtos REQ-1/AC-5 — um produto não pode estar em mais de uma promoção
 * `isActive: true` ao mesmo tempo (checagem por flag, não por overlap de janela de datas — ADR
 * em plan.md: trade-off aceito, evita decidir "qual desconto vale" entre promoções
 * concorrentes). Devolve os ids em conflito (vazio = sem conflito); `otherActivePromotions` já
 * deve vir sem a própria promoção sendo criada/editada (filtrada por quem chama).
 */
export function findConflictingProductIds(productIds: string[], otherActivePromotions: IPromotion[]): string[] {
  const productIdsInOtherActivePromotions = new Set(otherActivePromotions.flatMap((promotion) => promotion.productIds));
  return productIds.filter((id) => productIdsInOtherActivePromotions.has(id));
}
