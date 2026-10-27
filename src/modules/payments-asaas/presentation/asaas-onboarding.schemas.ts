import { z } from 'zod';

/** specs/0101-integracao-asaas (fase 1) — campos obrigatórios de `POST /v3/accounts` (Asaas),
 * conferidos na documentação oficial. */
export const createAsaasSubaccountSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  cpfCnpj: z.string().min(11),
  // Achado real (pedido explícito do usuário) — exigido pelo Asaas pra pessoa física, ausente
  // desde a implementação original desta spec (ver "Achado real" em tasks.md).
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mobilePhone: z.string().min(10),
  incomeValue: z.number().positive(),
  address: z.string().min(1),
  addressNumber: z.string().min(1),
  province: z.string().min(1),
  postalCode: z.string().min(8),
  companyType: z.enum(['MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION']).optional(),
});

/** Pedido explícito do usuário (follow-up) — `POST .../subaccount/reconnect`, identifica qual
 * entrada de `previousAsaasSubaccounts` restaurar. */
export const reconnectAsaasSubaccountSchema = z.object({
  asaasAccountId: z.string().min(1),
});
