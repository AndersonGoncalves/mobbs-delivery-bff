import { isValidCpf } from './cpf-validator';

describe('isValidCpf', () => {
  it('AC-11: aceita CPF válido, com ou sem máscara', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('529.982.247-25')).toBe(true);
  });

  it('AC-11: rejeita dígito verificador inválido', () => {
    expect(isValidCpf('52998224700')).toBe(false);
  });

  it('AC-11: rejeita sequências repetidas (ex.: 111.111.111-11)', () => {
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('00000000000')).toBe(false);
  });

  it('rejeita tamanho diferente de 11 dígitos', () => {
    expect(isValidCpf('123')).toBe(false);
    expect(isValidCpf('')).toBe(false);
  });
});
