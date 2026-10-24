import { z } from 'zod';

/** specs/0170-integracao-mercado-pago — `code` é o único campo que o frontend recebe de volta
 * do Mercado Pago no redirect (`?code=...&state=...`); `state` é validado só no frontend
 * (`sessionStorage`, ver plan.md) — o BFF não precisa dele, só troca o `code`. */
export const mercadoPagoOAuthCallbackSchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/, 'PKCE inválido').optional(),
});
