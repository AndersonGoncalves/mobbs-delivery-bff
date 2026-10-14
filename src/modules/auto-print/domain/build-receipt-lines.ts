import { ICustomer } from '../../customers/domain/entities/customer.entity';
import { IOrder, IOrderItemSelection, PaymentMethod } from '../../orders/domain/entities/order.entity';
import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import { stripAccents } from '../../../shared/utils/strip-accents';

export interface ReceiptLine {
  text: string;
  bold?: boolean;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  creditCard: 'Cartao de credito',
  debitCard: 'Cartao de debito',
  bankTransfer: 'Transferencia bancaria',
};

const ORDER_TYPE_LABELS: Record<IOrder['orderType'], string> = {
  delivery: 'ENTREGA',
  pickup: 'RETIRADA BALCAO',
  table: 'MESA/BALCAO',
};

function money(value: number): string {
  return `R$${value.toFixed(2).replace('.', ',')}`;
}

function formatOrderDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function selectionLines(selections: IOrderItemSelection[], depth = 0): ReceiptLine[] {
  return selections.flatMap((selection) => {
    const prefix = ' '.repeat(depth * 2 + 2);
    const delta = selection.priceDelta > 0 ? ` (+${money(selection.priceDelta)})` : '';
    const line: ReceiptLine = { text: `${prefix}${stripAccents(selection.groupName)}: ${stripAccents(selection.optionName)}${delta}` };
    const nested = selection.nestedSelections ? selectionLines(selection.nestedSelections, depth + 1) : [];
    return [line, ...nested];
  });
}

/**
 * specs/0139-impressao-automatica-bridge — "Decisões de design (BFF)": espelha campo por campo
 * (mesma ordem, mesma formatação) `OrderPrintArea.tsx` (mobbs-delivery-web), pro recibo impresso
 * pelo bridge ficar visualmente idêntico ao botão "Imprimir" da retaguarda. Mantido em sincronia
 * manualmente — qualquer mudança de layout lá deve ser replicada aqui (e vice-versa), os dois
 * lados têm teste cobrindo o texto exato esperado.
 *
 * Só cobre `delivery`/`pickup` (único tipo que passa pela fila de impressão automática, REQ-2 —
 * pedido de mesa/balcão nunca entra nela).
 */
export function buildReceiptLines(order: IOrder, restaurant: IRestaurant, customer: ICustomer | null): ReceiptLine[] {
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const lines: ReceiptLine[] = [];

  lines.push({ text: stripAccents(restaurant.name).toUpperCase(), bold: true });
  if (restaurant.phone) lines.push({ text: `Tel: ${restaurant.phone}` });
  if (restaurant.document) lines.push({ text: `CNPJ: ${restaurant.document}` });
  lines.push({ text: '' });
  lines.push({ text: `ID PEDIDO: ${order.orderNumber}` });
  lines.push({ text: `Horario: ${formatOrderDateTime(order.createdAt)}` });
  lines.push({ text: `Tipo: ${ORDER_TYPE_LABELS[order.orderType]}` });
  lines.push({ text: '-'.repeat(32) });

  if (customer) {
    lines.push({ text: `NOME: ${stripAccents(customer.name).toUpperCase()}` });
    if (customer.phone) lines.push({ text: `Fone: ${customer.phone}` });
  }
  if (order.orderType === 'delivery') {
    lines.push({ text: `Endereco: ${stripAccents(order.deliveryAddress ?? 'nao informado')}` });
  }
  lines.push({ text: '' });

  lines.push({ text: `ITENS (${itemCount})` });
  for (const item of order.items) {
    lines.push({ text: `# ${item.quantity}x ${stripAccents(item.productName)} ${money(item.unitPrice * item.quantity)}` });
    if (item.selections && item.selections.length > 0) lines.push(...selectionLines(item.selections));
    if (item.notes) lines.push({ text: `  Obs.: ${stripAccents(item.notes)}` });
    lines.push({ text: '-'.repeat(32) });
  }

  lines.push({ text: '' });
  lines.push({ text: `Itens (${itemCount}): ${money(order.subtotal)}` });
  lines.push({ text: `Desconto: ${money(order.discount)}` });
  lines.push({ text: `Entrega: ${money(order.deliveryFee)}` });
  lines.push({ text: '' });
  lines.push({ text: `TOTAL: ${money(order.total)}`, bold: true });
  lines.push({ text: '-'.repeat(32) });
  lines.push({ text: `Pagamento: ${PAYMENT_LABELS[order.paymentMethod]}` });
  lines.push({ text: '' });
  lines.push({ text: '-- BsDelivery --' });

  return lines;
}
