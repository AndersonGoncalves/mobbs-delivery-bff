import { IOrder } from './entities/order.entity';

/**
 * Pedido explícito do usuário (17/11/2026) — generaliza o cálculo que antes vivia só em
 * `OrdersController.attachAutoPrintMissed` (delivery/pickup, contado desde a `confirmado` no
 * `statusHistory`) pra cobrir também mesa/balcão, contado desde `tableClosedAt` (fechamento) —
 * mesa nunca passa pelo status `confirmado` e fica aberta por horas, então usar a mesma referência
 * de delivery faria todo ticket de mesa aparecer "perdido" desde sempre. Usado tanto por
 * `OrdersController` (delivery/pickup) quanto por `TableServiceController` (mesa/balcão), mesmo
 * padrão de `isFiscalPrintMissed` (também compartilhado entre os dois).
 */
export function isAutoPrintMissed(
  order: Pick<IOrder, 'orderType' | 'status' | 'autoPrintStatus' | 'statusHistory' | 'tableClosedAt'>,
  maxAgeMinutes: number,
): boolean {
  if (order.autoPrintStatus === 'printed') return false;
  if (order.status === 'cancelado') return false;
  const cutoff = Date.now() - maxAgeMinutes * 60_000;

  if (order.orderType === 'table') {
    if (order.status !== 'entregue' || !order.tableClosedAt) return false;
    return new Date(order.tableClosedAt).getTime() < cutoff;
  }

  if (order.orderType !== 'delivery' && order.orderType !== 'pickup') return false;
  const confirmedEntry = order.statusHistory.find((entry) => entry.status === 'confirmado');
  return confirmedEntry !== undefined && new Date(confirmedEntry.changedAt).getTime() < cutoff;
}
