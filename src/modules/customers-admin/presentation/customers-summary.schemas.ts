import { z } from 'zod';

/**
 * REQ-2 — `GET /restaurants/me/customers-summary?search=...`, opcional (sem `search`, lista
 * tudo). Pedido explícito do usuário (follow-up) — `fromDate`/`toDate` (ISO `YYYY-MM-DD`,
 * opcionais) filtram o PERÍODO de `totalOrders`/`totalSpent`; a lista de clientes em si continua
 * sendo "todo cliente que já pediu alguma vez" (sem os dois = sem filtro, todo o período).
 */
export const customersSummaryQuerySchema = z.object({
  search: z.string().min(1).optional(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fromDate deve estar em formato YYYY-MM-DD').optional(),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'toDate deve estar em formato YYYY-MM-DD').optional(),
});
