import { z } from 'zod';

/** specs/0015-estoque-compras REQ-1 — cadastro simples, sem validação de dígito de documento. */
export const saveSupplierSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  document: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email('E-mail inválido').optional(),
});

export const setSupplierActiveSchema = z.object({
  isActive: z.boolean(),
});
