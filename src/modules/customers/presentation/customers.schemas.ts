import { z } from 'zod';

import { isValidCpf } from '../domain/cpf-validator';

/** REQ-1/REQ-11 — cada campo é opcional (o app manda só o que edita); CPF, se enviado, precisa
 * passar no dígito verificador (não só formato). */
export const updateCustomerProfileSchema = z
  .object({
    name: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    document: z.string().min(1).optional(),
  })
  .refine((data) => !data.document || isValidCpf(data.document), {
    message: 'CPF inválido',
    path: ['document'],
  });

/** REQ-3/REQ-4 (`specs/0011-perfil-cliente`) — criar/editar endereço. */
export const saveAddressSchema = z.object({
  label: z.string().min(1),
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().optional(),
  neighborhood: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  zipCode: z.string().min(1),
});
