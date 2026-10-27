import { z } from 'zod';

/** specs/0175-cobranca-assinatura-asaas REQ-4 — campos exigidos pelo Asaas pra cadastrar o
 * restaurante como pagador (cliente) da conta da plataforma; mesmo padrão de
 * `createAsaasSubaccountSchema` (specs/0101). */
export const completeBillingPayerSchema = z.object({
  legalName: z.string().min(1),
  document: z.string().min(11),
  email: z.string().email(),
  phone: z.string().min(10),
  address: z.object({
    street: z.string().min(1),
    number: z.string().min(1),
    complement: z.string().optional(),
    neighborhood: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(2),
    zipCode: z.string().min(8),
  }),
});
