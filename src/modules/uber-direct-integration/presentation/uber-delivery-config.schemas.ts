import { z } from 'zod';

/** specs/0121-integracao-uber-entregas REQ-1 — credenciais/CEP digitados pelo operador;
 * `webhookToken` nunca vem do corpo (gerado por conta própria, ver
 * `IUberDeliveryConfigRepository`). CEP com 8 dígitos (mesmo padrão de
 * `supplier.schemas.ts`). */
export const saveUberDeliveryConfigSchema = z.object({
  customerId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  originZipCode: z.string().regex(/^\d{8}$/, 'Informe um CEP com 8 dígitos'),
});
