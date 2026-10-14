import { z } from 'zod';

export const blockCustomerSchema = z.object({
  phone: z.string().trim().min(1, 'Celular é obrigatório'),
});
