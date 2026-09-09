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

/** REQ-2 (`specs/0017-lgpd-privacidade`) — versão dos termos que o cliente aceitou. */
export const acceptTermsSchema = z.object({
  version: z.string().min(1),
});

/** REQ-1 (`specs/0012-favoritos`) — favoritar um produto no restaurante atual. */
export const addFavoriteSchema = z.object({
  restaurantId: z.string().min(1),
  productId: z.string().min(1),
});

/** REQ-3 (`specs/0012-favoritos`) — `GET /customers/me/favorites?restaurantId=...`. */
export const listFavoritesQuerySchema = z.object({
  restaurantId: z.string().min(1),
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
