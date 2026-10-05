import { randomInt } from 'crypto';

import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';

/** Sem 0/O/1/I pra não confundir quando alguém copia o código de uma tela pra outra. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export function generateReferralCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/** specs/0043-programa-indicacao REQ-1 — código permanente e único entre restaurantes. */
export async function generateUniqueReferralCode(restaurantRepository: IRestaurantRepository): Promise<string> {
  let code = generateReferralCode();
  while ((await restaurantRepository.findByReferralCode(code)) !== null) {
    code = generateReferralCode();
  }
  return code;
}
