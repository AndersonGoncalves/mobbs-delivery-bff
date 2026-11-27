import { z } from 'zod';

import { paginationQuerySchema } from '../../../shared/http/pagination';
import { isValidCpf } from '../../customers/domain/cpf-validator';
import { saveAddressSchema } from '../../customers/presentation/customers.schemas';

// specs/0229 REQ-1 — CPF opcional, aceito com ou sem pontuação e gravado só com os dígitos.
const cpfSchema = z
  .string()
  .transform((value) => value.replace(/\D/g, ''))
  .refine(isValidCpf, 'CPF inválido');
const emailSchema = z.string().trim().toLowerCase().email('E-mail inválido');

/**
 * REQ-2 — `GET /restaurants/me/customers-summary?search=...`, opcional (sem `search`, lista
 * tudo). Pedido explícito do usuário (follow-up) — `fromDate`/`toDate` (ISO `YYYY-MM-DD`,
 * opcionais) filtram o PERÍODO de `totalOrders`/`totalSpent`; a lista de clientes em si continua
 * sendo "todo cliente que já pediu alguma vez" (sem os dois = sem filtro, todo o período).
 *
 * Achado de auditoria pré-produção (31/10/2026) — "customers-summary sem paginação, agrega o
 * histórico inteiro": `page`/`pageSize` OPCIONAIS (mesmo `paginationQuerySchema` de
 * `/restaurants/me/products`) — omitidos, devolve a lista inteira exatamente como antes.
 */
export const customersSummaryQuerySchema = z.object({
  search: z.string().min(1).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fromDate deve estar em formato YYYY-MM-DD').optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'toDate deve estar em formato YYYY-MM-DD').optional(),
}).merge(paginationQuerySchema);

// Pedido explícito do usuário (follow-up) — mensagens em português: antes usavam o texto padrão
// do zod, que a tela só repassava escondido atrás de um Alert genérico ("confira o telefone"),
// sem dar nenhuma pista real do que falhou.
/** (achado real, pedido explícito do usuário) — "NOVO" em Clientes, `POST /restaurants/me/customers`. */
export const createCustomerByRestaurantSchema = z.object({
  name: z.string().min(1, 'Informe o nome'),
  phone: z.string().min(8, 'Informe um telefone válido (com DDD)'),
  // specs/0229 REQ-1/REQ-2 — opcionais; `address` cria um endereço na LISTA do cliente (mesma
  // validação de "Novo endereço"), nunca substitui os existentes.
  document: cpfSchema.optional(),
  email: emailSchema.optional(),
  address: saveAddressSchema.optional(),
});

/**
 * Pedido explícito do usuário — editar nome/telefone do cliente pela retaguarda
 * (`PUT /restaurants/me/customers-summary/:customerId`), mesmo par de campos do cadastro manual
 * acima; ambos opcionais (edição parcial), mas pelo menos um precisa vir.
 */
export const updateCustomerByRestaurantSchema = z
  .object({
    name: z.string().min(1, 'Informe o nome').optional(),
    phone: z.string().min(8, 'Informe um telefone válido (com DDD)').optional(),
    // specs/0229 REQ-4 — string vazia apaga (quando o restaurante pode editar).
    document: z.union([z.literal(''), cpfSchema]).optional(),
    email: z.union([z.literal(''), emailSchema]).optional(),
  })
  .refine((data) => data.name !== undefined || data.phone !== undefined || data.document !== undefined || data.email !== undefined, {
    message: 'Informe ao menos um campo para atualizar',
  });
