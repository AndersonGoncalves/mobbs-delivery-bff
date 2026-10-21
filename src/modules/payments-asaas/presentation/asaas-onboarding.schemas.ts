import { z } from 'zod';

/** specs/0101-integracao-asaas (fase 1) — campos obrigatórios de `POST /v3/accounts` (Asaas),
 * conferidos na documentação oficial. */
export const createAsaasSubaccountSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  cpfCnpj: z.string().min(11),
  mobilePhone: z.string().min(10),
  incomeValue: z.number().positive(),
  address: z.string().min(1),
  addressNumber: z.string().min(1),
  province: z.string().min(1),
  postalCode: z.string().min(8),
  companyType: z.enum(['MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION']).optional(),
});
