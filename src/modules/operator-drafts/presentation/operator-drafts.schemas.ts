import { z } from 'zod';

import { orderItemSchema } from '../../orders/presentation/orders.schemas';

const optionalString = (schema: z.ZodString) =>
  schema
    .optional()
    .nullable()
    .transform((value) => value ?? undefined);

const slotParamSchema = z.object({ slot: z.coerce.number().int().refine((value) => value === 1 || value === 2, 'Slot deve ser 1 ou 2') });

export function parseSlotParam(params: unknown): 1 | 2 {
  return slotParamSchema.parse(params).slot as 1 | 2;
}

const originSchema = z.enum(['web', 'extensao']).optional();

const adjustmentSchema = z
  .object({
    type: z.enum(['discount', 'surcharge']),
    mode: z.enum(['fixed', 'percent']),
    value: z.number().nonnegative(),
    description: optionalString(z.string()),
  })
  .optional();

/**
 * specs/0174-pdv-extensao-chrome-lateral REQ-9/REQ-11 — `revision` obrigatório: todo `PUT` é uma
 * escrita otimista contra a revisão que o cliente viu por último (ver
 * `operator-draft.repository.interface.ts`, `save`). Reaproveita `orderItemSchema`
 * (`orders.schemas.ts`) pro formato do item, nunca redefine em paralelo.
 */
export const saveOperatorDraftSchema = z.object({
  revision: z.number().int().nonnegative(),
  modality: z.enum(['delivery', 'pickup', 'counter']),
  items: z.array(orderItemSchema).default([]),
  customerId: optionalString(z.string()),
  customerName: optionalString(z.string()),
  customerPhone: optionalString(z.string()),
  deliveryAddress: optionalString(z.string()),
  deliveryNeighborhood: optionalString(z.string()),
  notes: optionalString(z.string()),
  couponCode: optionalString(z.string()),
  adjustment: adjustmentSchema,
  paymentMethod: z.enum(['creditCard', 'creditCardOnline', 'debitCard', 'pix', 'cash']).optional(),
  cashChangeFor: z.coerce.number().positive().optional(),
  origin: originSchema,
});

export const clearOperatorDraftSchema = z.object({
  revision: z.number().int().nonnegative(),
});

/**
 * REQ-23 — `clientRequestId` é a chave de idempotência do clique de finalizar; `revision` evita
 * finalizar uma revisão que o operador nem viu ainda (REQ-11).
 */
export const finalizeOperatorDraftSchema = z.object({
  revision: z.number().int().nonnegative(),
  clientRequestId: z.string().min(1).max(128),
  origin: originSchema,
});

export const customerByPhoneQuerySchema = z.object({
  phone: z.string().min(1, 'Informe um telefone'),
});

export const quickCreateCustomerSchema = z.object({
  name: z.string().min(1, 'Informe o nome do cliente'),
  phone: z.string().min(1, 'Informe o telefone'),
});
