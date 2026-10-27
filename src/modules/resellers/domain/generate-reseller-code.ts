import { randomInt } from 'crypto';

import { IResellerRepository } from './repositories/reseller.repository.interface';

/** specs/0189-painel-revenda REQ-1 — mesma regra de `generate-referral-code.ts`
 * (`modules/referrals`), duplicada de propósito (plan.md — módulos sem acoplamento entre si):
 * sem 0/O/1/I pra não confundir quando alguém copia o código de uma tela pra outra. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export function generateResellerCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** REQ-2 — código de 6 caracteres, único entre revendedores. */
export async function generateUniqueResellerCode(repository: IResellerRepository): Promise<string> {
  let code = generateResellerCode();
  while ((await repository.findByCode(code)) !== null) {
    code = generateResellerCode();
  }
  return code;
}
