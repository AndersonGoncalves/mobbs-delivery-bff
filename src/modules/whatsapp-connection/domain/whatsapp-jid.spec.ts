import { toWhatsAppJid, toWhatsAppJidCandidates } from './whatsapp-jid';

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

describe('toWhatsAppJidCandidates (specs/0068)', () => {
  it('celular com nono dígito: tenta com o 9 e depois sem (conta antiga registrada sem o 9)', () => {
    expect(toWhatsAppJidCandidates('(85)98422-4877')).toEqual([
      '5585984224877@s.whatsapp.net',
      '558584224877@s.whatsapp.net',
    ]);
  });

  it('celular sem o nono dígito: tenta como veio e depois com o 9', () => {
    expect(toWhatsAppJidCandidates('558584224877')).toEqual([
      '558584224877@s.whatsapp.net',
      '5585984224877@s.whatsapp.net',
    ]);
  });

  it('telefone fixo (começa com 2-5 após o DDD) tem um único candidato', () => {
    expect(toWhatsAppJidCandidates('1133334444')).toEqual(['551133334444@s.whatsapp.net']);
  });
});
