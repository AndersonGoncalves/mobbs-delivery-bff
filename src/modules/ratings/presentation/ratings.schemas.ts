import { z } from 'zod';

export const submitRatingSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export const listRatingsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(50).optional().default(20),
});

/** specs/0078-resposta-restaurante-avaliacoes REQ-2. */
export const replyToRatingSchema = z.object({
  text: z.string().min(1).max(1000),
});
