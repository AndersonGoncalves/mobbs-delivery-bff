import { IOrder } from '../../orders/domain/entities/order.entity';
import { buildMessagePlaceholders } from './message-placeholders';
import { renderTemplate, resolveTemplate } from './whatsapp-message-helpers';

export interface OrderReceiptRestaurantInput {
  slug: string;
  orderConfirmationGreeting?: string;
  /** specs/0069 — template editável do recibo; ausente usa `DEFAULT_ORDER_RECEIPT_TEMPLATE`. */
  orderReceiptWhatsAppTemplate?: string;
}

export interface OrderReceiptCustomerInput {
  name: string;
  phone?: string;
}

export interface OrderReceiptInput {
  restaurant: OrderReceiptRestaurantInput;
  customer: OrderReceiptCustomerInput;
  order: IOrder;
  /** `Order` não guarda `cardBrand` (fica só no `Payment`, registro separado) — quem monta o
   * recibo (`WhatsAppNotificationService`) já tem esse dado à mão no momento da criação do
   * pedido (mesmo corpo da requisição), então passa aqui em vez de fazer outra consulta. */
  cardBrand?: string;
  /** copia-e-cola Pix do pedido (`buildOrderPixCode`) — nunca a chave crua (specs/0069). */
  pixCode?: string;
}

export const DEFAULT_GREETING = 'Obrigado por pedir com a gente, {nomeCliente}!';

/**
 * specs/0069 — layout do recibo quando o restaurante não configurou um template próprio (igual ao
 * layout fixo de antes, agora como template). Linhas cujo placeholder fica vazio (`Previsão`,
 * `Desconto`) somem sozinhas (`renderTemplate`).
 */
export const DEFAULT_ORDER_RECEIPT_TEMPLATE = [
  '{saudacao}',
  '',
  '*Pedido #{numeroPedido}*',
  'Acompanhe: {linkAcompanhamento}',
  '',
  '*Itens*',
  '{itens}',
  '',
  'Subtotal: {subtotal}',
  '',
  '*{tipoPedido}*',
  'Para: {nomeCliente}',
  '{enderecoEntrega}',
  'Previsão: {previsaoEntrega}',
  'Desconto: {desconto}',
  '*Total: {total}*',
  '',
  '{pagamento}',
].join('\n');

/**
 * specs/0013-notificacoes-whatsapp REQ-1/REQ-6 a REQ-10 + specs/0069 — recibo enviado ao CLIENTE
 * na criação do pedido. Domain puro (sem I/O), testável sem sessão de WhatsApp/Mongo real.
 * `{saudacao}` é a saudação configurável (`orderConfirmationGreeting`) já resolvida.
 */
export function buildOrderReceiptMessage(input: OrderReceiptInput): string {
  const { restaurant, customer, order, cardBrand, pixCode } = input;

  const values = buildMessagePlaceholders({
    order,
    customerName: customer.name,
    customerPhone: customer.phone,
    restaurantSlug: restaurant.slug,
    pixCode,
    cardBrand,
  });
  const saudacao = renderTemplate(resolveTemplate(restaurant.orderConfirmationGreeting, DEFAULT_GREETING), values);

  return renderTemplate(resolveTemplate(restaurant.orderReceiptWhatsAppTemplate, DEFAULT_ORDER_RECEIPT_TEMPLATE), { ...values, saudacao });
}
