import { z } from 'zod';

/** specs/0189-painel-revenda REQ-2. */
export const createResellerSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(1),
});

export const setResellerActiveSchema = z.object({
  isActive: z.boolean(),
});

/** REQ-6 — só `establishmentName` obrigatório (plan.md decisão 1). */
export const resellerProspectInputSchema = z.object({
  establishmentName: z.string().trim().min(1),
  phone: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1).optional(),
  notes: z.string().trim().min(1).optional(),
});

/** REQ-8. */
export const convertProspectSchema = z.object({
  restaurantId: z.string().trim().min(1),
});
