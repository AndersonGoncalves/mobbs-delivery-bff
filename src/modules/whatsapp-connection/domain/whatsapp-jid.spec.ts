import { toWhatsAppJid } from './whatsapp-jid';

describe('toWhatsAppJid', () => {
  it('adiciona o código do país (55) a um celular sem ele', () => {
    expect(toWhatsAppJid('11999999999')).toBe('5511999999999@s.whatsapp.net');
  });

  it('remove formatação (parênteses, espaço, traço) antes de montar o JID', () => {
    expect(toWhatsAppJid('(11) 99999-9999')).toBe('5511999999999@s.whatsapp.net');
  });

  it('não duplica o código do país quando já vem com ele', () => {
    expect(toWhatsAppJid('5511999999999')).toBe('5511999999999@s.whatsapp.net');
  });

  it('não confunde um DDD 55 (Santa Maria/RS) com código de país já presente', () => {
    // 11 dígitos (DDD 55 + celular de 9 dígitos) — SEM código de país, mesmo começando com "55".
    expect(toWhatsAppJid('55991234567')).toBe('5555991234567@s.whatsapp.net');
  });

  it('telefone fixo (10 dígitos) também recebe o código do país', () => {
    expect(toWhatsAppJid('1133334444')).toBe('551133334444@s.whatsapp.net');
  });
});
