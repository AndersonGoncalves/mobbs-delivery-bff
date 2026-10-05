import { normalizePhoneNumber } from './normalize-phone-number';

/**
 * Mesma regra de `isValidCellphone` do app (`mobbs_utils`): 10 ou 11 dígitos nacionais, DDD entre
 * 11 e 99, e celular de 11 dígitos com `9` logo depois do DDD. Aceita o formato salvo (com "55"),
 * porque `normalizePhoneNumber` é o que grava o telefone do cliente.
 */
export function isValidCellphone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const national = normalizePhoneNumber(phone).slice(2);
  if (national.length !== 10 && national.length !== 11) return false;
  const ddd = Number(national.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  return national.length === 10 || national[2] === '9';
}
