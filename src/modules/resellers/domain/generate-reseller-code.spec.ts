import { IResellerRepository } from './repositories/reseller.repository.interface';
import { generateResellerCode, generateUniqueResellerCode } from './generate-reseller-code';

describe('generateResellerCode (specs/0189-painel-revenda REQ-1)', () => {
  it('gera 6 caracteres sem 0/O/1/I (fácil de ditar e copiar)', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateResellerCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    }
  });

  it('repete a geração quando o código já existe em outro revendedor', async () => {
    const findByCode = jest.fn().mockResolvedValueOnce({ id: 'reseller-x' }).mockResolvedValue(null);
    const repository = { findByCode } as unknown as IResellerRepository;

    const code = await generateUniqueResellerCode(repository);

    expect(findByCode).toHaveBeenCalledTimes(2);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });
});
