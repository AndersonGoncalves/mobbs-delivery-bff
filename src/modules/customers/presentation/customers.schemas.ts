import { z } from 'zod';

import { isValidCpf } from '../domain/cpf-validator';
import { normalizePhoneNumber } from '../../../shared/utils/normalize-phone-number';

/** specs/0077 — string em branco (`""`/só espaços) vira "campo não enviado". O app antigo mandava
 * `document: ""` quando o cliente não tinha CPF e o "Salvar" do perfil falhava com 400; cada campo já é
 * opcional e "não enviado" já significa "não mexer" (`?? existing`), então em branco = igual. */
const blankToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value);

/** REQ-1/REQ-11 — cada campo é opcional (o app manda só o que edita); CPF, se enviado, precisa
 * passar no dígito verificador (não só formato).
 * specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-3 — `phone` normalizado do mesmo
 * jeito que `restaurants.schemas.ts` (prefixo "55", sem duplicar se já vier com ele). */
export const updateCustomerProfileSchema = z
  .object({
    name: z.preprocess(blankToUndefined, z.string().min(1).optional()),
    phone: z.preprocess(blankToUndefined, z.string().min(1).transform(normalizePhoneNumber).optional()),
    document: z.preprocess(blankToUndefined, z.string().min(1).optional()),
    // specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-6 — sessão anônima
    // (convidado) sem e-mail vindo do token Firebase; "Entrar com e-mail" manda esse campo.
    email: z.preprocess(blankToUndefined, z.string().email().optional()),
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
