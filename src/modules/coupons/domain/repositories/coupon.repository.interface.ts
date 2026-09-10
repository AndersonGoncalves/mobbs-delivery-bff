import { CouponDiscountType, ICoupon } from '../entities/coupon.entity';

/** REQ-1 — mesmo shape usado pra criar e editar (`CouponsController`, POST/PUT). */
export interface CouponInput {
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderValue?: number;
  validFrom: string;
  validUntil?: string;
  usageLimit?: number;
  usageLimitPerCustomer?: number;
  isActive: boolean;
}

export interface ICouponRepository {
  /** REQ-5 — todos os cupons do restaurante do operador logado, com `usageCount` atual. */
  findManyByRestaurant(restaurantId: string): Promise<ICoupon[]>;

  findById(id: string): Promise<ICoupon | null>;

  /** REQ-2/REQ-3 — busca pelo código digitado, escopado ao restaurante (`code` não é único globalmente). */
  findByCode(restaurantId: string, code: string): Promise<ICoupon | null>;

  create(restaurantId: string, input: CouponInput): Promise<ICoupon>;

  update(id: string, input: CouponInput): Promise<ICoupon>;

  /**
   * REQ-4 — compare-and-swap: só incrementa `usageCount` quando ainda está abaixo de
   * `usageLimit` (ou quando o cupom não tem `usageLimit` configurado); devolve `null` quando o
   * limite já foi atingido (quem chama trata como 409, mesmo padrão de
   * `PurchaseOrderMongooseRepository.markAsReceivedIfOpen`, specs/0015).
   */
  incrementUsageIfWithinLimit(id: string): Promise<ICoupon | null>;
}
