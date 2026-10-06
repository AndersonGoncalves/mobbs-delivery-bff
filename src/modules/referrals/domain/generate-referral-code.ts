import { randomInt } from 'crypto';

import { IReferralCodeRepository } from './repositories/referral-code.repository.interface';

/** Sem 0/O/1/I pra não confundir quando alguém copia o código de uma tela pra outra. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export function generateReferralCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** specs/0110 REQ-1 — código de 6 caracteres, único entre clientes. */
export async function generateUniqueReferralCode(repository: IReferralCodeRepository): Promise<string> {
  let code = generateReferralCode();
  while ((await repository.findCustomerIdByCode(code)) !== null) {
    code = generateReferralCode();
  }
  return code;
}
