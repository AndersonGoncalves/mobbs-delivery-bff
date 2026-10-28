import { z } from 'zod';

/** specs/0090-integracao-ifood REQ-9 — credenciais digitadas pelo operador (cadastro de
 * parceiro já feito direto no Portal do Parceiro iFood, fora do mobbs). */
export const saveIFoodCredentialsSchema = z.object({
  ifoodMerchantId: z.string().min(1),
  ifoodClientId: z.string().min(1),
  ifoodClientSecret: z.string().min(1),
});
