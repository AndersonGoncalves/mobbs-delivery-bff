import { z } from 'zod';

/** REQ-2 — `GET /restaurants/me/customers-summary?search=...`, opcional (sem `search`, lista tudo). */
export const customersSummaryQuerySchema = z.object({
  search: z.string().min(1).optional(),
});
