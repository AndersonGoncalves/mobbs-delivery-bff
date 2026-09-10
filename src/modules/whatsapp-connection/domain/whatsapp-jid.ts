/**
 * Converte um telefone brasileiro (formato salvo em `Customer.phone`/`Restaurant.phone` — só
 * dígitos com DDD, sem código de país, ex.: "11999999999") pro formato de JID do WhatsApp
 * (`<país><ddd><número>@s.whatsapp.net`). Domain puro (sem I/O) — testável sem Baileys/Mongo.
 *
 * Decide por **tamanho**, não só pelo prefixo "55" — um número local de 11 dígitos com DDD 55
 * (Santa Maria/RS, ex. "55991234567") seria confundido com "já tem código de país" se a checagem
 * fosse só `startsWith('55')`. Números BR sem código de país têm 10 (fixo) ou 11 (celular)
 * dígitos; com código de país, 12 ou 13.
 */
export function toWhatsAppJid(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const hasCountryCode = digits.startsWith('55') && (digits.length === 12 || digits.length === 13);
  const withCountryCode = hasCountryCode ? digits : `55${digits}`;
  return `${withCountryCode}@s.whatsapp.net`;
}
