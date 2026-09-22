import { normalizePhoneNumber } from './normalize-phone-number';

describe('normalizePhoneNumber (specs/0047 REQ-3)', () => {
  it('AC-3: prefixa "55" quando o número não tem código de país (11 dígitos, celular)', () => {
    expect(normalizePhoneNumber('85986404604')).toBe('5585986404604');
  });

  it('AC-3: prefixa "55" quando o número não tem código de país (10 dígitos, fixo)', () => {
    expect(normalizePhoneNumber('8532654321')).toBe('558532654321');
  });

  it('AC-3: não duplica "55" quando o número já vem com código de país', () => {
    expect(normalizePhoneNumber('5585986404604')).toBe('5585986404604');
  });

  it('limpa máscara/formatação antes de normalizar', () => {
    expect(normalizePhoneNumber('(85)98640-4604')).toBe('5585986404604');
  });

  it('DDD 55 sem código de país não é confundido com "já tem código de país" (mesmo raciocínio de toWhatsAppJid)', () => {
    // "55991234567" tem 11 dígitos (celular local, DDD 55) — não pode virar "55991234567" sem prefixo.
    expect(normalizePhoneNumber('55991234567')).toBe('5555991234567');
  });
});
