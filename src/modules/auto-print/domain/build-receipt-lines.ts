import { ICustomer } from '../../customers/domain/entities/customer.entity';
import { IOrder, IOrderItemSelection, PaymentMethod } from '../../orders/domain/entities/order.entity';
import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import { stripAccents } from '../../../shared/utils/strip-accents';

export interface ReceiptLine {
  text: string;
  bold?: boolean;
  /** Pedido explícito do usuário (16/11/2026) — quando presente, a bridge (`mobbs-delivery-print`)
   * imprime este conteúdo como QR code em vez de texto (`text` fica vazio/label, ignorado nesse
   * caso). Usado só pelo cupom fiscal (`buildFiscalReceiptLines`) — nunca pelo ticket normal. */
  qr?: string;
  /** Pedido explícito do usuário (16/11/2026) — achado real: o BFF não sabe a largura de verdade
   * configurada na impressora (`PRINTER_WIDTH` só existe no `.env` da bridge); mandar
   * `'-'.repeat(32)` fixo deixava um espaço vazio grande quando a largura real é 48 (default da
   * `node-thermal-printer`, `createPrinter` em `printer.ts` nunca sobrescreve). Quando presente
   * (`text` fica vazio, ignorado), a bridge chama `drawLine()` da própria lib — desenha a linha
   * na largura exata configurada, qualquer que ela seja, sem o BFF precisar adivinhar um número. */
  divider?: boolean;
  /** Pedido explícito do usuário (16/11/2026) — imprime com a Fonte B (condensada) da impressora,
   * que cabe mais caracteres na mesma largura física — usado só pra chave de acesso da NFCe
   * (44 dígitos + espaços = 54 caracteres, maior que os 48 da Fonte A normal, por isso quebrava
   * em duas linhas) caber numa linha só, igual o DANFE real. Nunca usado pelo ticket normal. */
  small?: boolean;
  /** Pedido explícito do usuário (16/11/2026) — centraliza a linha (a bridge chama `alignCenter()`
   * antes e `alignLeft()` depois), usado só no bloco "consulte pela chave de acesso" do cupom
   * fiscal (URL de consulta, rótulo e a própria chave) e no rótulo do QR code. */
  center?: boolean;
  /** Pedido explícito do usuário (16/11/2026) — bypassa o fold de 48 colunas da própria lib
   * (`append()` em vez de `println()` na bridge), sem trocar de fonte (diferente de `small`) —
   * usado na linha "Protocolo de autorizacao: {protocolo}  {data}", que ultrapassa 48 caracteres
   * mesmo em Fonte A normal (rótulo + protocolo de ~15 dígitos + espaços + data completa). */
  noWrap?: boolean;
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Dinheiro',
  pix: 'Pix',
  creditCard: 'Cartao de Credito Maquininha',
  creditCardOnline: 'Cartao de credito (pago online)',
  debitCard: 'Cartao de Debito Maquininha',
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

/** Pedido explícito do usuário (17/11/2026) — valor em dinheiro do ajuste manual de mesa/balcão
 * (`order.tableAdjustment`), igual `tableAdjustmentAmount` em `OrderPrintArea.tsx`
 * (mobbs-delivery-web) e em `build-fiscal-receipt-lines.ts` — percentual sobre subtotal + taxa de
 * serviço + couvert, fixo usa o valor cru. */
function tableAdjustmentAmount(order: IOrder): number {
  if (!order.tableAdjustment) return 0;
  const base = order.subtotal + (order.serviceChargeAmount ?? 0) + (order.coverCharge ?? 0);
  return order.tableAdjustment.mode === 'percent' ? (base * order.tableAdjustment.value) / 100 : order.tableAdjustment.value;
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
 * Pedido explícito do usuário (17/11/2026) — passa a cobrir também `table` (mesa/balcão), que
 * agora entra na fila automática no fechamento da mesa (`findPendingAutoPrint`) — antes só
 * `delivery`/`pickup` entravam, mesa dependia só de `window.print()` no navegador. O ramo de
 * totais/pagamento de mesa espelha o branch `order.orderType === 'table'` de `OrderPrintArea.tsx`.
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
  lines.push({ text: '', divider: true });

  if (customer) {
    lines.push({ text: `NOME: ${stripAccents(customer.name).toUpperCase()}` });
    if (customer.phone) lines.push({ text: `Fone: ${customer.phone}` });
  }
  if (order.orderType === 'delivery') {
    lines.push({ text: `Endereco: ${stripAccents(order.deliveryAddress ?? 'nao informado')}` });
  }
  if (order.orderType === 'table') {
    lines.push({ text: order.tableName ? `Mesa: ${stripAccents(order.tableName)}` : 'Balcao' });
  }
  lines.push({ text: '' });

  lines.push({ text: `ITENS (${itemCount})` });
  for (const item of order.items) {
    lines.push({ text: `# ${item.quantity}x ${stripAccents(item.productName)} ${money(item.unitPrice * item.quantity)}` });
    if (item.selections && item.selections.length > 0) lines.push(...selectionLines(item.selections));
    if (item.notes) lines.push({ text: `  Obs.: ${stripAccents(item.notes)}` });
    lines.push({ text: '', divider: true });
  }

  lines.push({ text: '' });
  // Pedido explícito do usuário (17/11/2026) — mesa/balcão mostra subtotal + taxa de serviço +
  // couvert + ajuste manual (condicionados a existirem), em vez de "Itens/Desconto/Entrega" —
  // espelha o branch `order.orderType === 'table'` de `OrderPrintArea.tsx`.
  if (order.orderType === 'table') {
    lines.push({ text: `Subtotal: ${money(order.subtotal)}` });
    if ((order.serviceChargeAmount ?? 0) > 0) lines.push({ text: `Taxa de servico: ${money(order.serviceChargeAmount!)}` });
    if ((order.coverCharge ?? 0) > 0) lines.push({ text: `Couvert: ${money(order.coverCharge!)}` });
    if (order.tableAdjustment) {
      const label = order.tableAdjustment.type === 'discount' ? 'Desconto' : 'Acrescimo';
      const description = order.tableAdjustment.description ? ` (${stripAccents(order.tableAdjustment.description)})` : '';
      lines.push({ text: `${label}${description}: ${money(tableAdjustmentAmount(order))}` });
    }
  } else {
    lines.push({ text: `Itens (${itemCount}): ${money(order.subtotal)}` });
    lines.push({ text: `Desconto: ${money(order.discount)}` });
    lines.push({ text: `Entrega: ${money(order.deliveryFee)}` });
  }
  lines.push({ text: '' });
  lines.push({ text: `TOTAL: ${money(order.total)}`, bold: true });
  lines.push({ text: '', divider: true });
  // Pedido explícito do usuário (17/11/2026) — mesa/balcão pode ter vários pagamentos
  // (`tablePayments`, um por método usado pra fechar a conta), em vez de um único `paymentMethod`.
  if (order.orderType === 'table') {
    for (const payment of order.tablePayments ?? []) {
      lines.push({ text: `Pago (${PAYMENT_LABELS[payment.method]}): ${money(payment.amount)}` });
    }
  } else {
    lines.push({ text: `Pagamento: ${PAYMENT_LABELS[order.paymentMethod]}` });
  }
  lines.push({ text: '' });
  lines.push({ text: '-- BsDelivery --' });

  return lines;
}
