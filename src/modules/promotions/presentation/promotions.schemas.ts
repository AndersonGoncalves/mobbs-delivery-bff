import { z } from 'zod';

const isoDateString = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Data inválida');

/** REQ-1/REQ-7 — mesmo formato pra criar (`POST`) e editar (`PUT`). */
export const savePromotionSchema = z
  .object({
    name: z.string().min(1, 'Nome é obrigatório'),
    discountPercentage: z.number().positive('Percentual de desconto deve ser maior que zero').max(100, 'Percentual de desconto não pode ser maior que 100%'),
    productIds: z.array(z.string().min(1)).min(1, 'Selecione ao menos um produto'),
    isActive: z.boolean().optional().default(true),
    startDate: isoDateString,
    endDate: isoDateString,
  })
  .superRefine((data, ctx) => {
    if (Date.parse(data.endDate) < Date.parse(data.startDate)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endDate'], message: 'Data de fim não pode ser antes da data de início' });
    }
  });

export type SavePromotionPayload = z.infer<typeof savePromotionSchema>;

export const setPromotionActiveSchema = z.object({ isActive: z.boolean() });
