import { z } from 'zod';

import { isValidCnpj } from '../../restaurants/domain/cnpj-validator';

/** specs/0091-integracao-fiscal-focusnfe REQ-1 — token/ambiente/documento/CNPJ digitados pelo
 * operador; `webhookToken`/`productionEnabled` nunca vêm do corpo (gerado/alternado por conta
 * própria, ver `IFiscalConfigRepository`). CNPJ validado por dígito verificador (`isValidCnpj`,
 * já usado em `specs/0029`), não só formato — mesmo raciocínio: nunca confiar só em máscara pra
 * um dado que vai direto pro payload fiscal (`cnpj_emitente`). */
export const saveFiscalConfigSchema = z.object({
  focusNfeToken: z.string().min(1),
  environment: z.enum(['homologacao', 'producao']),
  documentType: z.enum(['nfce', 'cfe', 'nfe']),
  cnpj: z.string().refine(isValidCnpj, { message: 'CNPJ inválido' }),
});

export const setFiscalProductionEnabledSchema = z.object({
  productionEnabled: z.boolean(),
});

/** REQ-6 — mesma faixa exigida pela FocusNFe pro cancelamento (15-255 caracteres). */
export const cancelFiscalDocumentSchema = z.object({
  justificativa: z.string().min(15).max(255),
});
