import { z } from 'zod';
import { isValidCpf } from '../../customers/domain/cpf-validator';
import { isValidCnpj } from '../../restaurants/domain/cnpj-validator';
import { isValidCellphone } from '../../../shared/utils/is-valid-cellphone';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EVP_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** specs/0194-ajustes-menu-ajuda-assinatura-estoque REQ-10 — chave Pix de destino do repasse do
 * saldo Asaas, validada por tipo (mesmo espírito de `referrals/domain/pix-key.ts`, mas com o enum
 * em inglês maiúsculo do contrato do Asaas e com CNPJ, que aquele validador não cobre). */
export const savePixTransferKeySchema = z
  .object({
    pixAddressKey: z.string().min(1),
    pixAddressKeyType: z.enum(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP']),
  })
  .refine(({ pixAddressKey, pixAddressKeyType }) => {
    switch (pixAddressKeyType) {
      case 'CPF':
        return isValidCpf(pixAddressKey.replace(/\D/g, ''));
      case 'CNPJ':
        return isValidCnpj(pixAddressKey.replace(/\D/g, ''));
      case 'PHONE':
        return isValidCellphone(pixAddressKey.replace(/\D/g, ''));
      case 'EMAIL':
        return EMAIL_REGEX.test(pixAddressKey);
      case 'EVP':
        return EVP_REGEX.test(pixAddressKey.toLowerCase());
    }
  }, 'Chave Pix inválida pro tipo selecionado.');

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
