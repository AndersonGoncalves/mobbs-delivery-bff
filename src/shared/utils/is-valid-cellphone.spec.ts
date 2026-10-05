import { isValidCellphone } from './is-valid-cellphone';

describe('isValidCellphone', () => {
  it('aceita celular de 11 dígitos com 9 depois do DDD, com ou sem código do país', () => {
    expect(isValidCellphone('85984224877')).toBe(true);
    expect(isValidCellphone('5585984224877')).toBe(true);
  });

  it('aceita fixo de 10 dígitos', () => {
    expect(isValidCellphone('8534224877')).toBe(true);
  });

  it('recusa celular de 11 dígitos sem 9 na frente', () => {
    expect(isValidCellphone('85884224877')).toBe(false);
  });

  it('recusa DDD inválido e quantidade errada de dígitos', () => {
    expect(isValidCellphone('00984224877')).toBe(false);
    expect(isValidCellphone('119999')).toBe(false);
    expect(isValidCellphone('')).toBe(false);
    expect(isValidCellphone(undefined)).toBe(false);
  });
});
