import { IOrder } from '../../orders/domain/entities/order.entity';
import { buildTrackingLink, formatCurrency, paymentMethodLabel, renderItem } from './whatsapp-message-helpers';

export interface NewOrderRestaurantMessageInput {
  /** já resolvido (`restaurant.newOrderRestaurantWhatsAppTemplate ?? DEFAULT_NEW_ORDER_RESTAURANT_TEMPLATE`). */
  template: string;
  order: IOrder;
  customerName: string;
  restaurantSlug: string;
}

// specs/0062-confirmar-pedido-whatsapp-restaurante REQ-3 — grava de verdade no autocadastro
// (`RestaurantSignupController`), não só serve como fallback em memória aqui.
export const DEFAULT_NEW_ORDER_RESTAURANT_TEMPLATE = [
  '✅ *NOVO PEDIDO*',
  '',
  'Olá! Acabei de fazer um pedido no app e queria confirmar que chegou direitinho 🙂',
  '',
  '*Pedido #{orderNumber}*',
  'Cliente: {customerName}',
  '',
  '*Itens*',
  '{items}',
  '',
  'Subtotal: {subtotal}',
  '{deliveryAddress}',
  '*Total: {total}*',
  'Pagamento: {paymentMethod}',
  '',
  'Acompanhar: {trackingLink}',
].join('\n');

/**
 * specs/0062-confirmar-pedido-whatsapp-restaurante REQ-2/REQ-5 — monta o texto que o cliente
 * revisa/envia pro WhatsApp do restaurante ao confirmar um pedido. Domain puro (sem I/O),
 * testável sem sessão de WhatsApp/Mongo real — mesmo padrão de `buildOrderReceiptMessage`
 * (specs/0013), reaproveitando os mesmos helpers de formatação.
 *
 * Diferente do recibo do cliente (`buildPaymentBlock`, que reafirma a própria chave Pix do
 * restaurante — útil pro cliente, redundante pro restaurante), o placeholder `{paymentMethod}`
 * aqui é só o rótulo da forma escolhida (`paymentMethodLabel`).
 */
export function buildNewOrderRestaurantMessage(input: NewOrderRestaurantMessageInput): string {
  const { template, order, customerName, restaurantSlug } = input;

  const deliveryAddressLine =
    order.orderType === 'delivery' ? `Endereço: ${order.deliveryAddress ?? 'não informado'}\nTaxa de entrega: ${formatCurrency(order.deliveryFee)}` : 'Retirada no local.';

  const estimatedDelivery = order.estimatedDeliveryAt ? new Date(order.estimatedDeliveryAt).toLocaleString('pt-BR') : 'não informada';

  return template
    .replaceAll('{orderNumber}', String(order.orderNumber))
    .replaceAll('{trackingLink}', buildTrackingLink(restaurantSlug, order.trackingToken))
    .replaceAll('{customerName}', customerName)
    .replaceAll('{items}', order.items.map(renderItem).join('\n'))
    .replaceAll('{subtotal}', formatCurrency(order.subtotal))
    .replaceAll('{deliveryAddress}', deliveryAddressLine)
    .replaceAll('{deliveryFee}', formatCurrency(order.deliveryFee))
    .replaceAll('{estimatedDelivery}', estimatedDelivery)
    .replaceAll('{total}', formatCurrency(order.total))
    .replaceAll('{paymentMethod}', paymentMethodLabel(order.paymentMethod));
}
