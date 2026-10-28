import { z } from 'zod';

/** Pedido explícito do usuário (follow-up) — `code` é o único campo que o frontend recebe de
 * volta do Facebook no redirect (`?code=...&state=...`); `state` é validado só no frontend
 * (`sessionStorage`), mesmo padrão de `mercadoPagoOAuthCallbackSchema`. */
export const instagramOAuthCallbackSchema = z.object({
  code: z.string().min(1),
});

/** Limite de legenda do Instagram é 2200 caracteres. */
export const createInstagramPostSchema = z.object({
  imageUrl: z.string().trim().url(),
  caption: z.string().trim().min(1).max(2200),
  scheduledAt: z.string().datetime(),
});
