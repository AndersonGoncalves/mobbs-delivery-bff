import { IOrder } from '../../orders/domain/entities/order.entity';
import { buildMessagePlaceholders } from './message-placeholders';
import { renderTemplate, resolveTemplate } from './whatsapp-message-helpers';

// specs/0063-notificacao-whatsapp-pedido-confirmado REQ-2/AC-4 — texto fixo já usado hoje, agora
// como fallback quando o restaurante não configurou um template próprio (retrocompatibilidade).
export const DEFAULT_ORDER_CONFIRMED_TEMPLATE = 'Seu pedido #{numeroPedido} foi confirmado pelo restaurante!';

// specs/0065 REQ-2/AC-4 — texto fixo já usado hoje, agora como fallback quando o restaurante não
// configurou um template próprio (retrocompatibilidade).
export const DEFAULT_OUT_FOR_DELIVERY_TEMPLATE = 'Seu pedido #{numeroPedido} saiu para entrega!';

// specs/0071 — textos padrão (equivalentes aos fixos de antes; o de cancelamento agora omite a
// linha "Motivo" sozinho quando não há motivo, via `renderTemplate`).
export const DEFAULT_ORDER_PREPARING_TEMPLATE = 'Seu pedido #{numeroPedido} está sendo preparado.';
export const DEFAULT_ORDER_CANCELLED_TEMPLATE = 'Pedido #{numeroPedido} foi cancelado.\nMotivo: {motivoCancelamento}';

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
    saiuParaEntrega?: string;
    emPreparo?: string;
    cancelado?: string;
  };
}

/**
 * specs/0013-notificacoes-whatsapp REQ-2/REQ-5 — texto diferente por status, sempre incluindo
 * `orderNumber`. `confirmado`/`emPreparo`/`saiuParaEntrega`/`cancelado` têm template editável por
 * restaurante (`specs/0063`/`0065`/`0071`); só `entregue` segue com texto fixo.
 */
export function buildOrderStatusMessage(input: OrderStatusMessageInput): string | null {
  const { order, customerName, customerPhone, restaurantSlug, pixCode, reason, templates } = input;

  const render = (template: string | undefined, fallback: string) =>
    renderTemplate(
      resolveTemplate(template, fallback),
      buildMessagePlaceholders({ order, customerName, customerPhone, restaurantSlug, pixCode, cancellationReason: reason }),
    );

  switch (order.status) {
    case 'confirmado':
      return render(templates.confirmado, DEFAULT_ORDER_CONFIRMED_TEMPLATE);
    case 'emPreparo':
      return render(templates.emPreparo, DEFAULT_ORDER_PREPARING_TEMPLATE);
    case 'saiuParaEntrega':
      return render(templates.saiuParaEntrega, DEFAULT_OUT_FOR_DELIVERY_TEMPLATE);
    case 'entregue':
      return `Seu pedido #${order.orderNumber} foi entregue. Bom apetite!`;
    case 'cancelado':
      return render(templates.cancelado, DEFAULT_ORDER_CANCELLED_TEMPLATE);
    // 'aguardandoConfirmacao' é o status inicial (coberto pelo recibo de criação, REQ-1, não por
    // uma mensagem de mudança de status) — nunca chega aqui via REQ-2 (mudança pós-criação).
    case 'aguardandoConfirmacao':
      return null;
  }
}
