import { z } from 'zod';

/** specs/0119-cadastro-motoboys REQ-1/REQ-3. */
export const saveMotoboySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  whatsapp: z.string().min(1, 'WhatsApp é obrigatório'),
  canMarkAsDelivered: z.boolean().default(true),
});

export const setMotoboyActiveSchema = z.object({
  isActive: z.boolean(),
});
