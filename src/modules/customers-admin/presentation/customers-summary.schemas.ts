import { z } from 'zod';

import { paginationQuerySchema } from '../../../shared/http/pagination';

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

/** (achado real, pedido explícito do usuário) — "NOVO" em Clientes, `POST /restaurants/me/customers`. */
export const createCustomerByRestaurantSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(8),
});

/**
 * Pedido explícito do usuário — editar nome/telefone do cliente pela retaguarda
 * (`PUT /restaurants/me/customers-summary/:customerId`), mesmo par de campos do cadastro manual
 * acima; ambos opcionais (edição parcial), mas pelo menos um precisa vir.
 */
export const updateCustomerByRestaurantSchema = z
  .object({
    name: z.string().min(1).optional(),
    phone: z.string().min(8).optional(),
  })
  .refine((data) => data.name !== undefined || data.phone !== undefined, {
    message: 'Informe ao menos um campo para atualizar',
  });
