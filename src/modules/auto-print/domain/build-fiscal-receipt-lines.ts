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

  lines.push({ text: stripAccents(restaurant.name).toUpperCase(), bold: true });
  if (restaurant.document) lines.push({ text: `CNPJ: ${restaurant.document}` });
  lines.push({ text: 'DANFE NFC-e - Documento Auxiliar da', bold: true });
  lines.push({ text: 'Nota Fiscal de Consumidor Eletronica', bold: true });
  lines.push({ text: '-'.repeat(32) });

  lines.push({ text: `ITENS (${itemCount})` });
  for (const item of order.items) {
    lines.push({ text: `# ${item.quantity}x ${stripAccents(item.productName)} ${money(item.unitPrice * item.quantity)}` });
  }
  if (order.deliveryFee > 0) {
    lines.push({ text: `# Taxa de entrega ${money(order.deliveryFee)}` });
  }
  lines.push({ text: '-'.repeat(32) });
  lines.push({ text: `TOTAL: ${money(order.total)}`, bold: true });
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
  lines.push({ text: 'www.nfce.fazenda.gov.br' });
  if (fiscal.qrCode) {
    lines.push({ text: '', qr: fiscal.qrCode });
  }
  lines.push({ text: '' });
  lines.push({ text: '-- BsDelivery --' });

  return lines;
}
