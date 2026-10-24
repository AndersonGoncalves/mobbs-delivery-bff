import { z } from 'zod';

/** specs/0015-estoque-compras REQ-1 — cadastro simples, sem validação de dígito de documento. */
export const saveSupplierSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  document: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email('E-mail inválido').optional(),
  address: z.object({
    zipCode: z.string().regex(/^(\d{8})?$/, 'Informe um CEP com 8 dígitos').optional(),
    street: z.string().trim().optional(),
    number: z.string().trim().optional(),
    complement: z.string().trim().optional(),
    neighborhood: z.string().trim().optional(),
    city: z.string().trim().optional(),
    state: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/, 'Informe a UF com 2 letras').optional(),
  }).optional(),
});

export const setSupplierActiveSchema = z.object({
  isActive: z.boolean(),
});
