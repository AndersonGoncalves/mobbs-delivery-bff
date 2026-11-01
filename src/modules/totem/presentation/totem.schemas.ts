import { z } from 'zod';

import { orderItemSchema } from '../../orders/presentation/orders.schemas';
import { totemPaymentMethodSchema } from '../../restaurants/presentation/restaurants.schemas';

/**
 * specs/0155-app-totem-autoatendimento REQ-10/REQ-11/REQ-14 — reaproveita `orderItemSchema`
 * (`orders.schemas.ts`) pro formato do item/seleção, nunca redefine em paralelo (mesmo cuidado
 * de `createOrderSchema`). Diferente do checkout do app cliente: sem `restaurantId` (vem do
 * `totemApiKeyMiddleware`, REQ-16), sem `customerId`/token Firebase — `customerName` obrigatório
 * (REQ-10), `customerPhone` opcional (REQ-10, WhatsApp não é obrigatório nesta v1). Sem
 * `deliveryAddress`/`deliveryNeighborhood`/`couponCode`/`cashbackAmount` — fora de escopo do
 * totem v1 (retirada no local, sem cupom/cashback por não haver cliente autenticado).
 */
export const createTotemOrderSchema = z.object({
  // Achado crítico da auditoria pré-produção (31/10/2026) — "sem chave de idempotência real na
  // criação de pedido": era opcional, e o servidor gerava uma chave ALEATÓRIA quando ausente
  // (`totem.controller.ts`), o que anula a própria deduplicação — um retry que não manda a
  // MESMA chave (rede falha depois do pedido já ter sido criado, app tenta de novo) nunca é
  // reconhecido como repetição. Agora obrigatória: o totem (app Flutter) gera uma vez por
  // tentativa de checkout e reenvia a mesma em qualquer retry — nunca o servidor inventando uma.
  idempotencyKey: z.string().min(1).max(128),
  customerName: z.string().min(1, 'Informe o nome do cliente'),
  customerPhone: z.string().min(1).optional(),
  items: z.array(orderItemSchema).min(1),
  notes: z.string().min(1).optional(),
  paymentMethod: totemPaymentMethodSchema,
  cashChangeFor: z.coerce.number().positive().optional(),
});

export type CreateTotemOrderPayload = z.infer<typeof createTotemOrderSchema>;
