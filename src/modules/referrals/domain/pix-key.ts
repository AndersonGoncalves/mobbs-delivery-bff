import { isValidCellphone } from '../../../shared/utils/is-valid-cellphone';
import { isValidCpf } from '../../customers/domain/cpf-validator';

/**
 * specs/0112 — chave Pix do cliente para pagar a recompensa de indicação. Formatos aceitos nesta versão:
 * CPF, celular, e-mail e chave aleatória (UUID). CNPJ fica fora.
 */
export type PixKeyType = 'cpf' | 'phone' | 'email' | 'random';

/** Versão dos Termos de Uso que o app mostra (`currentTermsVersion` no app). Tem que ficar igual. */
export const CURRENT_TERMS_VERSION = '2026-10-06';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Devolve a chave normalizada, ou `null` se o valor não bate com o tipo. */
export function normalizePixKey(type: PixKeyType, raw: string): string | null {
  const value = raw.trim();
  switch (type) {
    case 'cpf': {
      const digits = value.replace(/\D/g, '');
      return isValidCpf(digits) ? digits : null;
    }
    case 'phone': {
      const digits = value.replace(/\D/g, '');
      return isValidCellphone(digits) ? digits : null;
    }
    case 'email':
      return EMAIL.test(value) ? value.toLowerCase() : null;
    case 'random':
      return UUID.test(value.toLowerCase()) ? value.toLowerCase() : null;
  }
}

/** Mostra só os 2 últimos caracteres (REQ-4). Ex.: `*********12`. */
export function maskPixKey(value: string): string {
  return `${'*'.repeat(Math.max(value.length - 2, 0))}${value.slice(-2)}`;
}
