import { IOrder } from '../../orders/domain/entities/order.entity';
import { PixKeyType } from '../../restaurants/domain/entities/restaurant.entity';
import { buildPaymentBlock as buildSharedPaymentBlock, buildTrackingLink, formatCurrency, renderItem } from './whatsapp-message-helpers';

export interface OrderReceiptRestaurantInput {
  name: string;
  slug: string;
  orderConfirmationGreeting?: string;
  pixKey?: string;
  pixKeyType?: PixKeyType;
  pixBeneficiaryName?: string;
}

export interface OrderReceiptCustomerInput {
  name: string;
}

export interface OrderReceiptInput {
  restaurant: OrderReceiptRestaurantInput;
  customer: OrderReceiptCustomerInput;
  order: IOrder;
  /** `Order` não guarda `cardBrand` (fica só no `Payment`, registro separado) — quem monta o
   * recibo (`WhatsAppNotificationService`) já tem esse dado à mão no momento da criação do
   * pedido (mesmo corpo da requisição), então passa aqui em vez de fazer outra consulta. */
  cardBrand?: string;
}

const DEFAULT_GREETING = 'Obrigado por pedir com a gente, {customerName}!';

/** REQ-7/REQ-8 — só a saudação é editável pelo restaurante; o resto do recibo nunca é. */
function buildGreeting(template: string | undefined, customerName: string): string {
  return (template ?? DEFAULT_GREETING).replace('{customerName}', customerName);
}

/** specs/0062-confirmar-pedido-whatsapp-restaurante — repassa pro helper compartilhado
 * (`whatsapp-message-helpers.ts`), mantendo a assinatura `OrderReceiptInput` já usada aqui. */
function buildPaymentBlock(input: OrderReceiptInput): string {
  return buildSharedPaymentBlock(input);
}

/**
 * specs/0013-notificacoes-whatsapp REQ-1/REQ-6 a REQ-10 — recibo detalhado enviado na criação do
 * pedido. Domain puro (sem I/O), testável sem sessão de WhatsApp/Mongo real.
 *
 * `deliveryAddress` é um texto livre (não estruturado com bairro/complemento/telefone
 * separados) — simplificação já existente em `IOrder` (`docs/architecture/data-model.md`, nota
 * em `Order`), não uma decisão desta spec; o bloco de entrega usa o texto como veio.
 */
export function buildOrderReceiptMessage(input: OrderReceiptInput): string {
  const { restaurant, customer, order } = input;

  const lines: string[] = [
    buildGreeting(restaurant.orderConfirmationGreeting, customer.name),
    '',
    `*Pedido #${order.orderNumber}*`,
    `Acompanhe: ${buildTrackingLink(restaurant.slug, order.trackingToken)}`,
    '',
    '*Itens*',
    ...order.items.map(renderItem),
    '',
    `Subtotal: ${formatCurrency(order.subtotal)}`,
  ];

  if (order.orderType === 'delivery') {
    lines.push('', '*Entrega*', `Para: ${customer.name}`, `Endereço: ${order.deliveryAddress ?? 'não informado'}`);
    lines.push(`Taxa de entrega: ${formatCurrency(order.deliveryFee)}`);
  } else {
    lines.push('', 'Retirada no local.');
  }

  if (order.estimatedDeliveryAt) {
    lines.push(`Previsão: ${new Date(order.estimatedDeliveryAt).toLocaleString('pt-BR')}`);
  }

  if (order.discount > 0) {
    lines.push(`Desconto: -${formatCurrency(order.discount)}`);
  }

  lines.push(`*Total: ${formatCurrency(order.total)}*`, '', buildPaymentBlock(input));

  return lines.join('\n');
}
