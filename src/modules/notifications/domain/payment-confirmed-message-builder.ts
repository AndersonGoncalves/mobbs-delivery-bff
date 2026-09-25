import { IOrder } from '../../orders/domain/entities/order.entity';
import { renderTemplate } from './whatsapp-message-helpers';

// specs/0064-notificacao-whatsapp-pix-confirmado REQ-2/AC-4 — texto padrão quando o restaurante
// não configurou um template próprio.
export const DEFAULT_PIX_CONFIRMED_TEMPLATE = 'Pagamento confirmado!';

export function buildPaymentConfirmedMessage(input: { template?: string; order: IOrder; customerName: string }): string {
  return renderTemplate(input.template ?? DEFAULT_PIX_CONFIRMED_TEMPLATE, {
    customerName: input.customerName,
    orderNumber: String(input.order.orderNumber),
  });
}
