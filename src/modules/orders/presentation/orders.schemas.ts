import { z } from 'zod';

import { IOrderItemSelection } from '../domain/entities/order.entity';

// specs/0005-checkout — árvore recursiva (produto composto, mesmo motivo de
// `nestedAdditionalGroups` em catalog/presentation) precisa de `z.lazy()`.
const orderItemSelectionSchema: z.ZodType<IOrderItemSelection> = z.lazy(() =>
  z.object({
    groupName: z.string().min(1),
    optionName: z.string().min(1),
    priceDelta: z.number(),
    nestedSelections: z.array(orderItemSelectionSchema).default([]),
  }),
);

const orderItemSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPrice: z.number().nonnegative(),
  selections: z.array(orderItemSelectionSchema).default([]),
  notes: z.string().optional(),
});

/**
 * REQ-6/REQ-7: endereço só é exigido quando `orderType == 'delivery'`; operadora do cartão só
 * quando `paymentMethod` é `creditCard`/`debitCard` — validado no BFF via `.superRefine`, não só
 * no formulário do app (mesma regra de "nunca confiar só no client" já aplicada em
 * `restaurants.schemas.ts`, `businessHourSchema`).
 */
export const createOrderSchema = z
  .object({
    restaurantId: z.string().min(1),
    items: z.array(orderItemSchema).min(1),
    orderType: z.enum(['delivery', 'pickup']),
    deliveryAddress: z.string().min(1).optional(),
    notes: z.string().optional(),
    paymentMethod: z.enum(['creditCard', 'debitCard', 'pix', 'cash', 'bankTransfer']),
    cardBrand: z.string().min(1).optional(),
    // specs/0022-cupons-desconto REQ-2 — opcional; o app só manda quando o cliente digitou e
    // "aplicou" um código no checkout. Revalidado sempre no controller (nunca confia no desconto
    // calculado pelo app) — este schema só garante o formato, não a validade do cupom em si.
    couponCode: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.orderType === 'delivery' && !data.deliveryAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deliveryAddress'],
        message: 'Endereço de entrega é obrigatório para pedidos de Delivery',
      });
    }
    if ((data.paymentMethod === 'creditCard' || data.paymentMethod === 'debitCard') && !data.cardBrand) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cardBrand'],
        message: 'Operadora do cartão é obrigatória para Cartão de Crédito/Débito',
      });
    }
  });

export type CreateOrderPayload = z.infer<typeof createOrderSchema>;

const orderStatusEnum = z.enum(['aguardandoConfirmacao', 'confirmado', 'emPreparo', 'saiuParaEntrega', 'entregue', 'cancelado']);

/** specs/0008-acompanhamento-vendas REQ-2/REQ-5 — status de destino; a transição em si é validada pelo controller. */
export const updateOrderStatusSchema = z.object({
  status: orderStatusEnum,
});

/** REQ-3 — motivo é obrigatório pro cancelamento pela retaguarda (diferente do cancelamento do cliente, specs/0006). */
export const cancelOrderWithReasonSchema = z.object({
  reason: z.string().min(1, 'Motivo do cancelamento é obrigatório'),
});

const isoDateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Data inválida');

/** REQ-4 — período do painel de vendas, vindo de query params (`GET /restaurants/me/sales-summary?from=...&to=...`). */
export const salesSummaryQuerySchema = z.object({
  from: isoDateString,
  to: isoDateString,
});
