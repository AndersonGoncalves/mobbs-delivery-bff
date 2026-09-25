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

/**
 * specs/0068 — JIDs candidatos pra um telefone brasileiro, na ordem de preferência. Contas de
 * WhatsApp criadas antes da adoção do nono dígito (comum em DDDs do Nordeste) estão registradas
 * SEM o "9" (`55 DDD 8 dígitos`), então o JID "óbvio" (com 9) aponta pra um número que não existe
 * e o `sendMessage` do Baileys "envia" sem erro nenhum. `onWhatsApp` decide qual dos candidatos
 * existe de verdade. Só celulares têm variante (fixo e números fora do padrão ficam com 1 JID).
 */
export function toWhatsAppJidCandidates(phone: string): string[] {
  const primary = toWhatsAppJid(phone);
  const number = primary.replace('@s.whatsapp.net', '');
  const local = number.slice(2); // DDD + número, sem o 55

  if (local.length === 11 && local[2] === '9') {
    return [primary, `55${local.slice(0, 2)}${local.slice(3)}@s.whatsapp.net`];
  }
  if (local.length === 10 && '6789'.includes(local[2])) {
    return [primary, `55${local.slice(0, 2)}9${local.slice(2)}@s.whatsapp.net`];
  }
  return [primary];
}
