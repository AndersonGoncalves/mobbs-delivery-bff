import { OrderStatus } from '../../orders/domain/entities/order.entity';

/**
 * specs/0013-notificacoes-whatsapp REQ-2/REQ-5 — texto diferente por status, sempre incluindo
 * `orderNumber`. Sem editor de template pela retaguarda nesta v1 (diferente da saudação do
 * recibo, REQ-7, que É editável) — hardcoded aqui de propósito.
 */
export function buildOrderStatusMessage(status: OrderStatus, orderNumber: number, reason?: string): string | null {
  switch (status) {
    case 'confirmado':
      return `Seu pedido #${orderNumber} foi confirmado pelo restaurante!`;
    case 'emPreparo':
      return `Seu pedido #${orderNumber} está sendo preparado.`;
    case 'saiuParaEntrega':
      return `Seu pedido #${orderNumber} saiu para entrega!`;
    case 'entregue':
      return `Seu pedido #${orderNumber} foi entregue. Bom apetite!`;
    case 'cancelado':
      return reason ? `Pedido #${orderNumber} cancelado: ${reason}` : `Pedido #${orderNumber} foi cancelado.`;
    // 'aguardandoConfirmacao' é o status inicial (coberto pelo recibo de criação, REQ-1, não por
    // uma mensagem de mudança de status) — nunca chega aqui via REQ-2 (mudança pós-criação).
    case 'aguardandoConfirmacao':
      return null;
  }
}
