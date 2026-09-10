import { ICoupon } from '../entities/coupon.entity';

/**
 * specs/0022-cupons-desconto REQ-2/REQ-3/REQ-6 — função pura de domínio (sem I/O), mesma
 * filosofia de `pix-br-code-builder.ts` (specs/0020) e `order-receipt-message-builder.ts`
 * (specs/0013): fácil de testar sem mocks. Quem chama (`CouponsController.validate` e
 * `OrdersController` em `POST /orders`) já resolveu o `ICoupon` (ou `null`, se o código não
 * existe) e a contagem de uso do cliente antes de chamar — este módulo não fala com repositório
 * nenhum.
 *
 * **Nunca confiar no desconto calculado pelo app** (plan.md, ADR) — `POST /orders` chama esta
 * mesma função de novo no momento de criar o pedido, mesmo que o app já tenha "validado" antes
 * (`POST /restaurants/:id/coupons/validate`) só pra feedback de UX.
 */
export interface ValidateCouponInput {
  /** `null` quando o código digitado não corresponde a nenhum cupom do restaurante (REQ-3). */
  coupon: ICoupon | null;
  /** `Order.subtotal` do pedido em andamento — o desconto nunca considera `deliveryFee`. */
  orderSubtotal: number;
  now: Date;
  /**
   * REQ-6 — quantas vezes o cliente (`Order.customerId`) já usou **este** cupom neste
   * restaurante; `0` quando o cupom não tem `usageLimitPerCustomer` configurado (o valor não é
   * usado nesse caso, mas quem chama sempre resolve um número, nunca `undefined`).
   */
  customerUsageCount: number;
}

export type ValidateCouponResult = { valid: true; discountAmount: number } | { valid: false; reason: string };

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function validateCoupon(input: ValidateCouponInput): ValidateCouponResult {
  const { coupon, orderSubtotal, now, customerUsageCount } = input;

  if (!coupon) {
    return { valid: false, reason: 'Cupom não encontrado' };
  }
  if (!coupon.isActive) {
    return { valid: false, reason: 'Cupom inativo' };
  }
  if (now < new Date(coupon.validFrom)) {
    return { valid: false, reason: 'Cupom ainda não está válido' };
  }
  if (coupon.validUntil && now > new Date(coupon.validUntil)) {
    return { valid: false, reason: 'Cupom expirado' };
  }
  if (coupon.minOrderValue !== undefined && orderSubtotal < coupon.minOrderValue) {
    return { valid: false, reason: `Pedido mínimo de R$ ${coupon.minOrderValue.toFixed(2)} para usar este cupom` };
  }
  // REQ-4 — a garantia forte (concorrência real) vem do compare-and-swap em
  // `incrementUsageIfWithinLimit`, não desta checagem; esta aqui só cobre o caso não concorrente
  // (mesmo dado já lido) pra devolver um `reason` específico em vez de deixar cair no CAS.
  if (coupon.usageLimit !== undefined && coupon.usageCount >= coupon.usageLimit) {
    return { valid: false, reason: 'Cupom atingiu o limite de uso' };
  }
  if (coupon.usageLimitPerCustomer !== undefined && customerUsageCount >= coupon.usageLimitPerCustomer) {
    return { valid: false, reason: 'Você já usou esse cupom o número máximo de vezes permitido' };
  }

  const rawDiscount =
    coupon.discountType === 'percentual' ? orderSubtotal * (coupon.discountValue / 100) : coupon.discountValue;
  // Desconto nunca ultrapassa o subtotal (nem em cupom de valor fixo maior que o pedido) — evita
  // `Order.total` negativo.
  const discountAmount = roundCurrency(Math.min(rawDiscount, orderSubtotal));

  return { valid: true, discountAmount };
}
