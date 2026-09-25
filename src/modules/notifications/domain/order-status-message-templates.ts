import { IOrder } from '../../orders/domain/entities/order.entity';
import { buildMessagePlaceholders } from './message-placeholders';
import { renderTemplate, resolveTemplate } from './whatsapp-message-helpers';

// specs/0063-notificacao-whatsapp-pedido-confirmado REQ-2/AC-4 — texto fixo já usado hoje, agora
// como fallback quando o restaurante não configurou um template próprio (retrocompatibilidade).
export const DEFAULT_ORDER_CONFIRMED_TEMPLATE = 'Seu pedido #{numeroPedido} foi confirmado pelo restaurante!';

export interface OrderStatusMessageInput {
  order: IOrder;
  customerName: string;
  customerPhone?: string;
  restaurantSlug: string;
  pixCode?: string;
  reason?: string;
  /**
   * specs/0063-notificacao-whatsapp-pedido-confirmado — só `confirmado` é parametrizável nesta
   * spec (`specs/0065-notificacao-whatsapp-saiu-para-entrega` adiciona `saiuParaEntrega` do mesmo
   * jeito, quando implementada). Os demais status continuam com o texto fixo abaixo.
   */
  templates: {
    confirmado?: string;
  };
}

/**
 * specs/0013-notificacoes-whatsapp REQ-2/REQ-5 — texto diferente por status, sempre incluindo
 * `orderNumber`. `emPreparo`/`entregue`/`cancelado` continuam hardcoded de propósito (fora de
 * escopo de `specs/0063`/`0065`, que tratam só `confirmado`/`saiuParaEntrega`).
 */
export function buildOrderStatusMessage(input: OrderStatusMessageInput): string | null {
  const { order, customerName, customerPhone, restaurantSlug, pixCode, reason, templates } = input;

  switch (order.status) {
    case 'confirmado':
      return renderTemplate(
        resolveTemplate(templates.confirmado, DEFAULT_ORDER_CONFIRMED_TEMPLATE),
        buildMessagePlaceholders({ order, customerName, customerPhone, restaurantSlug, pixCode }),
      );
    case 'emPreparo':
      return `Seu pedido #${order.orderNumber} está sendo preparado.`;
    case 'saiuParaEntrega':
      return `Seu pedido #${order.orderNumber} saiu para entrega!`;
    case 'entregue':
      return `Seu pedido #${order.orderNumber} foi entregue. Bom apetite!`;
    case 'cancelado':
      return reason ? `Pedido #${order.orderNumber} cancelado: ${reason}` : `Pedido #${order.orderNumber} foi cancelado.`;
    // 'aguardandoConfirmacao' é o status inicial (coberto pelo recibo de criação, REQ-1, não por
    // uma mensagem de mudança de status) — nunca chega aqui via REQ-2 (mudança pós-criação).
    case 'aguardandoConfirmacao':
      return null;
  }
}
