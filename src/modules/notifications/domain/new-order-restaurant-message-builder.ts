import { IOrder } from '../../orders/domain/entities/order.entity';
import { buildMessagePlaceholders } from './message-placeholders';
import { renderTemplate, resolveTemplate } from './whatsapp-message-helpers';

export interface NewOrderRestaurantMessageInput {
  /** já resolvido (`restaurant.newOrderRestaurantWhatsAppTemplate ?? DEFAULT_NEW_ORDER_RESTAURANT_TEMPLATE`). */
  template: string;
  order: IOrder;
  customerName: string;
  restaurantSlug: string;
  customerPhone?: string;
  pixCode?: string;
}

// specs/0062-confirmar-pedido-whatsapp-restaurante REQ-3 — grava de verdade no autocadastro
// (`RestaurantSignupController`), não só serve como fallback em memória aqui.
export const DEFAULT_NEW_ORDER_RESTAURANT_TEMPLATE = [
  '✅ *NOVO PEDIDO*',
  '',
  'Olá! Acabei de fazer um pedido no app e queria confirmar que chegou direitinho 🙂',
  '',
  '*Pedido #{numeroPedido}*',
  'Cliente: {nomeCliente}',
  '',
  '*Itens*',
  '{itens}',
  '',
  'Subtotal: {subtotal}',
  '{enderecoEntrega}',
  '*Total: {total}*',
  'Pagamento: {formaPagamento}',
  '',
  'Acompanhar: {linkAcompanhamento}',
].join('\n');

/**
 * specs/0062-confirmar-pedido-whatsapp-restaurante REQ-2/REQ-5 — monta o texto que o cliente
 * revisa/envia pro WhatsApp do restaurante ao confirmar um pedido. Domain puro (sem I/O). Mesmo
 * vocabulário de placeholders (português) das demais mensagens, `specs/0069`.
 */
export function buildNewOrderRestaurantMessage(input: NewOrderRestaurantMessageInput): string {
  const { template, order, customerName, customerPhone, restaurantSlug, pixCode } = input;

  return renderTemplate(resolveTemplate(template, DEFAULT_NEW_ORDER_RESTAURANT_TEMPLATE), buildMessagePlaceholders({ order, customerName, customerPhone, restaurantSlug, pixCode }));
}
