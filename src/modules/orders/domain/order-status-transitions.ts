import { OrderStatus, OrderType } from './entities/order.entity';

/**
 * docs/architecture/data-model.md §"Regra de transição de OrderStatus" — avanço de status é
 * sempre sequencial, um passo por vez (specs/0008-acompanhamento-vendas REQ-5/AC-5: não pode
 * pular de "Aguardando confirmação" direto pra "Entregue"). Fonte de verdade no BFF; a retaguarda
 * espelha essa mesma regra só pra feedback imediato (plan.md de 0008, ADR).
 */
const NEXT_STATUS: Record<OrderStatus, OrderStatus | null> = {
  aguardandoConfirmacao: 'confirmado',
  confirmado: 'emPreparo',
  emPreparo: 'saiuParaEntrega',
  saiuParaEntrega: 'entregue',
  entregue: null,
  cancelado: null,
};

/**
 * specs/0096-status-pedido-retirada-sem-saiu-entrega REQ-1 — retirada não passa por
 * "saiu para entrega": de "emPreparo" vai direto pra "entregue". Entrega segue a sequência inteira.
 */
export function nextOrderStatus(current: OrderStatus, orderType: OrderType): OrderStatus | null {
  if (orderType === 'pickup' && current === 'emPreparo') return 'entregue';
  return NEXT_STATUS[current];
}

export function isValidOrderStatusTransition(current: OrderStatus, next: OrderStatus, orderType: OrderType): boolean {
  return nextOrderStatus(current, orderType) === next;
}

/**
 * docs/architecture/data-model.md §"Cancelamento pelo próprio cliente" — a regra da retaguarda
 * (specs/0008 REQ-3) é mais permissiva que a do cliente (specs/0006 REQ-6, só
 * `aguardandoConfirmacao`): o operador pode cancelar em qualquer estado anterior à saída pra
 * entrega.
 */
const CANCELLABLE_STATUSES: OrderStatus[] = ['aguardandoConfirmacao', 'confirmado', 'emPreparo'];

export function isOrderCancellable(status: OrderStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status);
}
