import { z } from 'zod';

const isoDateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Data inválida');

/**
 * REQ-1 — mesmo formato pra criar (`POST`) e editar (`PUT`, inclusive ativar/desativar via
 * `isActive`, "criar, editar e desativar" no mesmo corpo — sem rota `PATCH .../active` própria,
 * `plan.md` só lista `GET/POST/PUT`). `code` normalizado (trim + uppercase) pra evitar
 * duplicidade por diferença de caixa ("promo10" vs "PROMO10").
 */
export const saveCouponSchema = z
  .object({
    // Normalizado (trim + uppercase) pelo controller, não aqui — `.transform()` neste projeto
    // (`tsconfig.json`, `strict: false`) faz o zod v4 inferir o campo como opcional em
    // `z.infer`, mesmo sendo obrigatório em runtime (`min(1)`); ver `CouponsController`.
    code: z.string().min(1, 'Código é obrigatório'),
    discountType: z.enum(['percentual', 'fixo']),
    discountValue: z.number().positive('Valor do desconto deve ser maior que zero'),
    minOrderValue: z.number().nonnegative('Valor mínimo não pode ser negativo').optional(),
    validFrom: isoDateString,
    validUntil: isoDateString.optional(),
    usageLimit: z.number().int('Limite de uso deve ser um número inteiro').positive('Limite de uso deve ser maior que zero').optional(),
    usageLimitPerCustomer: z
      .number()
      .int('Limite por cliente deve ser um número inteiro')
      .positive('Limite por cliente deve ser maior que zero')
      .optional(),
    isActive: z.boolean().optional().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === 'percentual' && data.discountValue > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountValue'],
        message: 'Desconto percentual não pode ser maior que 100%',
      });
    }
  });

export type SaveCouponPayload = z.infer<typeof saveCouponSchema>;

/**
 * REQ-2/REQ-3 — corpo de `POST /restaurants/:id/coupons/validate` (cliente, checkout): código
 * digitado + subtotal do pedido em andamento (`Order.subtotal`, nunca `total` — o desconto nunca
 * considera `deliveryFee`).
 */
export const validateCouponSchema = z.object({
  code: z.string().min(1, 'Código é obrigatório'),
  orderSubtotal: z.number().nonnegative('Subtotal do pedido não pode ser negativo'),
});
