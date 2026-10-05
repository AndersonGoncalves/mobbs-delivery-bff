import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { generateReferralCode, generateUniqueReferralCode } from './generate-referral-code';

describe('generateReferralCode (specs/0043-programa-indicacao REQ-1)', () => {
  it('gera 6 caracteres sem 0/O/1/I (fácil de ditar e copiar)', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateReferralCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  it('repete a geração quando o código já existe em outro restaurante', async () => {
    const findByReferralCode = jest.fn().mockResolvedValueOnce({ id: 'r-x' }).mockResolvedValue(null);
    const restaurantRepository = { findByReferralCode } as unknown as IRestaurantRepository;

    const code = await generateUniqueReferralCode(restaurantRepository);

    expect(findByReferralCode).toHaveBeenCalledTimes(2);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});
