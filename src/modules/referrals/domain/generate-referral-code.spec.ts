import { IReferralCodeRepository } from './repositories/referral-code.repository.interface';
import { generateReferralCode, generateUniqueReferralCode } from './generate-referral-code';

describe('generateReferralCode (specs/0110 REQ-1)', () => {
  it('gera 6 caracteres sem 0/O/1/I (fácil de ditar e copiar)', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateReferralCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  it('repete a geração quando o código já existe em outro cliente', async () => {
    const findCustomerIdByCode = jest.fn().mockResolvedValueOnce('cu-x').mockResolvedValue(null);
    const repository = { findCustomerIdByCode } as unknown as IReferralCodeRepository;

    const code = await generateUniqueReferralCode(repository);

    expect(findCustomerIdByCode).toHaveBeenCalledTimes(2);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});
