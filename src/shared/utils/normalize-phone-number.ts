/**
 * specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-3 — normaliza um telefone
 * brasileiro pro formato sempre salvo com o código do país ("55" + DDD + número, só dígitos,
 * ex.: "5511999999999"). Mesma lógica de detecção por **tamanho** já usada em
 * `whatsapp-connection/domain/whatsapp-jid.ts` (`toWhatsAppJid`) — decide por tamanho, não só
 * pelo prefixo "55", pra não confundir um número local de DDD 55 (Santa Maria/RS) com "já tem
 * código de país". Números BR sem código de país têm 10 (fixo) ou 11 (celular) dígitos; com
 * código de país, 12 ou 13.
 */
export function normalizePhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const hasCountryCode = digits.startsWith('55') && (digits.length === 12 || digits.length === 13);
  return hasCountryCode ? digits : `55${digits}`;
}
