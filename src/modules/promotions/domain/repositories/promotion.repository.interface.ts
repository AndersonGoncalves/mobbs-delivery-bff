import { IPromotion } from '../entities/promotion.entity';

/** REQ-1/REQ-7 — mesmo shape usado pra criar e editar (`PromotionsController`, POST/PUT). */
export interface PromotionInput {
  name: string;
  discountPercentage: number;
  productIds: string[];
  isActive: boolean;
  startDate: string;
  endDate: string;
}

export interface IPromotionRepository {
  /** Todas as promoções do restaurante (retaguarda, REQ-1), mais recente primeiro. */
  findByRestaurantId(restaurantId: string): Promise<IPromotion[]>;

  /**
   * Só `isActive: true` (sem filtro de janela de datas — quem chama aplica
   * `isPromotionCurrentlyActive`, `promotion-pricing.ts`, quando precisa do preço/tag). Usado
   * tanto na resolução do cardápio quanto na validação de conflito (REQ-1/AC-5).
   */
  findActiveByRestaurantId(restaurantId: string): Promise<IPromotion[]>;

  findById(id: string): Promise<IPromotion | null>;

  create(restaurantId: string, input: PromotionInput): Promise<IPromotion>;

  update(id: string, input: PromotionInput): Promise<IPromotion>;

  /** REQ-6 — toggle dedicado, mesmo padrão de `Restaurant.isActive`/`setActive`. */
  setActive(id: string, isActive: boolean): Promise<IPromotion>;
}
