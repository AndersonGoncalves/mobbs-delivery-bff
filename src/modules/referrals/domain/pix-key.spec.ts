import { maskPixKey, normalizePixKey } from './pix-key';

describe('normalizePixKey (specs/0112 REQ-1)', () => {
  it('aceita CPF válido, com ou sem pontuação', () => {
    expect(normalizePixKey('cpf', '529.982.247-25')).toBe('52998224725');
  });

  it('recusa CPF com dígito verificador errado', () => {
    expect(normalizePixKey('cpf', '52998224726')).toBeNull();
  });

  it('aceita celular com DDD e recusa número curto', () => {
    expect(normalizePixKey('phone', '(85) 98640-4604')).toBe('85986404604');
    expect(normalizePixKey('phone', '9864')).toBeNull();
  });

  it('aceita e-mail, em minúsculo, e recusa texto sem @', () => {
    expect(normalizePixKey('email', 'Ana@Exemplo.com')).toBe('ana@exemplo.com');
    expect(normalizePixKey('email', 'ana.exemplo.com')).toBeNull();
  });

  it('aceita chave aleatória UUID v4 e recusa outros valores', () => {
    expect(normalizePixKey('random', '123e4567-e89b-42d3-a456-426614174000')).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(normalizePixKey('random', 'nao-e-uuid')).toBeNull();
  });
});

describe('maskPixKey (specs/0112 REQ-4)', () => {
  it('mostra só os 2 últimos caracteres', () => {
    expect(maskPixKey('52998224725')).toBe('*********25');
  });
});
