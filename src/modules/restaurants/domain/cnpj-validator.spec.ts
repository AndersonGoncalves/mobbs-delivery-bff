import { isValidCnpj } from './cnpj-validator';

describe('isValidCnpj', () => {
  it('aceita CNPJ válido, com ou sem máscara', () => {
    expect(isValidCnpj('11222333000181')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
  });

  it('rejeita dígito verificador inválido', () => {
    expect(isValidCnpj('11222333000180')).toBe(false);
  });

  it('rejeita sequências repetidas (ex.: 11.111.111/1111-11)', () => {
    expect(isValidCnpj('11111111111111')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
  });

  it('rejeita tamanho diferente de 14 dígitos', () => {
    expect(isValidCnpj('123')).toBe(false);
    expect(isValidCnpj('')).toBe(false);
  });
});
