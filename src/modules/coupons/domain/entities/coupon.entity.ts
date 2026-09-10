export type CouponDiscountType = 'percentual' | 'fixo';

/**
 * specs/0022-cupons-desconto REQ-1 — cupom de desconto do restaurante (multi-tenant, mesmo
 * isolamento por `restaurantId` do resto do sistema; "Fora de escopo" da spec: nada de cupom
 * "da plataforma" válido em mais de um restaurante). `code` é único **por restaurante**
 * (`CouponMongooseModel`, índice composto `restaurantId + code`), não globalmente.
 *
 * `discountType`/`discountValue`: `'percentual'` (0–100, aplica `discountValue`% sobre o
 * subtotal) ou `'fixo'` (valor absoluto em reais, nunca aplica mais que o subtotal — ver
 * `validateCoupon`). `minOrderValue` opcional (sem mínimo quando ausente). `validUntil` opcional
 * (sem data de expiração quando ausente) — `validFrom` é sempre obrigatório (REQ-1: "data de
 * validade (início/fim)").
 *
 * `usageLimit`/`usageLimitPerCustomer` opcionais (sem limite quando ausentes). `usageCount` é o
 * contador incrementado atomicamente em `CouponMongooseRepository.incrementUsageIfWithinLimit`
 * (REQ-4, compare-and-swap — ver comentário lá).
 */
export interface ICoupon {
  id: string;
  restaurantId: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderValue?: number;
  validFrom: string;
  validUntil?: string;
  usageLimit?: number;
  usageLimitPerCustomer?: number;
  usageCount: number;
  isActive: boolean;
}
