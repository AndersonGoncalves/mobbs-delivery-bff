import { IOrder } from '../../orders/domain/entities/order.entity';
import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import { stripAccents } from '../../../shared/utils/strip-accents';
import { ReceiptLine } from './build-receipt-lines';

function money(value: number): string {
  return `R$${value.toFixed(2).replace('.', ',')}`;
}

function formatOrderDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Chave de acesso da NFCe é impressa em 11 grupos de 4 dígitos, convenção padrão do DANFCE
 * oficial — mais fácil de conferir manualmente contra o QR code do que uma string corrida de 44
 * dígitos. */
function formatAccessKey(key: string): string {
  return key.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

/** XX.XXX.XXX/XXXX-XX — máscara padrão de CNPJ (14 dígitos), aplicada aqui porque o XML devolve
 * só os dígitos crus (`<CNPJ>07456684000180</CNPJ>`). */
function formatCnpj(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 14) return raw;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/** XXXXX-XXX — máscara padrão de CEP (8 dígitos), mesmo motivo de `formatCnpj` (XML devolve cru). */
function formatCep(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 8) return raw;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** (XX) XXXXX-XXXX (celular, 11 dígitos) ou (XX) XXXX-XXXX (fixo, 10 dígitos) — `<fone>` do XML
 * vem só com DDD + número, sem o "55" do país (diferente do padrão E.164 usado em
 * `normalizePhoneNumber` em outros módulos). */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return raw;
}

/**
 * Pedido explícito do usuário (16/11/2026) — cupom fiscal simplificado, impresso automaticamente
 * pela bridge junto do ticket do pedido (`ReceiptLine[]`, mesmo mecanismo de `buildReceiptLines`,
 * fila separada). Não é o DANFE completo (HTML hospedado pela FocusNFe, `Order.fiscal.
 * documentUrl`) — a bridge só imprime texto ESC/POS, nunca renderiza página web. Em vez disso,
 * reproduz a estrutura de um DANFCE simplificado real (cabeçalho do emitente, itens, totais,
 * identificação da nota, chave de acesso, QR code de consulta), o que já é como boa parte das
 * impressoras térmicas de restaurante emite o cupom fiscal de NFCe na prática.
 *
 * Só chamado quando `order.fiscal?.status === 'emitido'` (ver `findPendingFiscalPrint`) — os
 * campos de `IOrderFiscal` usados aqui (accessKey/number/series/qrCode) só existem nesse caso.
 */
export function buildFiscalReceiptLines(order: IOrder, restaurant: IRestaurant): ReceiptLine[] {
  const fiscal = order.fiscal!;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const lines: ReceiptLine[] = [];

  // Pedido explícito do usuário (16/11/2026) — cabeçalho inteiro vem do XML da nota (dados reais
  // do emitente cadastrados no painel da FocusNFe), nunca do nosso `Restaurant`/`FiscalConfig` —
  // os dois podem divergir do que foi cadastrado de fato pra emissão fiscal. Nome/CNPJ caem no
  // fallback de `Restaurant` só se o XML não puder ser lido (nunca existia fallback pros outros
  // campos — IE/endereço/telefone — por isso esses somem juntos nesse caso, sem substituto).
  const emitterName = fiscal.emitterName ?? restaurant.name;
  lines.push({ text: stripAccents(emitterName).toUpperCase(), bold: true });

  const emitterCnpj = fiscal.emitterCnpj ?? restaurant.document;
  if (emitterCnpj) {
    const cnpjLine = `CNPJ: ${formatCnpj(emitterCnpj)}` + (fiscal.emitterIe ? `  IE: ${fiscal.emitterIe}` : '');
    lines.push({ text: cnpjLine });
  }
  const address = fiscal.emitterAddress;
  if (address?.street) {
    lines.push({ text: `${stripAccents(address.street).toUpperCase()}, ${address.number ?? 'S/N'} - ${stripAccents(address.neighborhood ?? '').toUpperCase()}` });
  }
  if (address?.zipCode || fiscal.emitterPhone) {
    const cepPart = address?.zipCode ? `CEP: ${formatCep(address.zipCode)}` : '';
    const phonePart = fiscal.emitterPhone ? `Tel.: ${formatPhone(fiscal.emitterPhone)}` : '';
    lines.push({ text: [cepPart, phonePart].filter(Boolean).join(' - ') });
  }
  if (address?.city) {
    lines.push({ text: `${stripAccents(address.city)} - ${address.state ?? ''}` });
  }
  lines.push({ text: 'DANFE NFC-e - Documento Auxiliar da', bold: true });
  lines.push({ text: 'Nota Fiscal de Consumidor Eletronica', bold: true });
  lines.push({ text: '', divider: true });

  lines.push({ text: `ITENS (${itemCount})` });
  for (const item of order.items) {
    lines.push({ text: `# ${item.quantity}x ${stripAccents(item.productName)} ${money(item.unitPrice * item.quantity)}` });
  }
  if (order.deliveryFee > 0) {
    lines.push({ text: `# Taxa de entrega ${money(order.deliveryFee)}` });
  }
  lines.push({ text: '', divider: true });
  lines.push({ text: `TOTAL: ${money(order.total)}`, bold: true });
  // Pedido explícito do usuário (16/11/2026) — tributos aproximados (Lei 12.741/2012), só existem
  // no XML da nota (nunca no JSON da FocusNFe) — ver `FocusNfeApiClient.fetchNfceXmlFields`.
  if (fiscal.approxTaxAmount !== undefined) {
    lines.push({ text: `Tributos aprox. (Lei 12.741/2012): ${money(fiscal.approxTaxAmount)}` });
  }
  lines.push({ text: '' });

  lines.push({ text: `NFC-e no ${fiscal.number ?? '-'} Serie ${fiscal.series ?? '-'}` });
  lines.push({ text: `Emissao: ${formatOrderDateTime(fiscal.emittedAt ?? order.createdAt)}` });
  lines.push({ text: '' });

  if (fiscal.accessKey) {
    lines.push({ text: 'Chave de acesso' });
    lines.push({ text: formatAccessKey(fiscal.accessKey) });
    lines.push({ text: '' });
  }
  lines.push({ text: 'Consulte pela Chave de Acesso em' });
  // Pedido explícito do usuário (16/11/2026) — URL de consulta real do estado do emitente
  // (`url_consulta_nf`, já devolvida pela FocusNFe) em vez da genérica federal fixa; só cai no
  // fallback se a FocusNFe não devolver (nunca aconteceu nos testes reais, mas defesa barata).
  lines.push({ text: fiscal.consultaUrl ?? 'www.nfce.fazenda.gov.br' });
  if (fiscal.qrCode) {
    lines.push({ text: '', qr: fiscal.qrCode });
  }
  lines.push({ text: '' });
  lines.push({ text: '-- BsDelivery --' });

  return lines;
}
