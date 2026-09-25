import { IOrder } from '../../orders/domain/entities/order.entity';
import { buildMessagePlaceholders } from './message-placeholders';
import { renderTemplate, resolveTemplate } from './whatsapp-message-helpers';

// specs/0064-notificacao-whatsapp-pix-confirmado REQ-2/AC-4 — texto padrão quando o restaurante
// não configurou um template próprio.
export const DEFAULT_PIX_CONFIRMED_TEMPLATE = 'Pagamento confirmado!';

export function buildPaymentConfirmedMessage(input: {
  template?: string;
  order: IOrder;
  customerName: string;
  customerPhone?: string;
  restaurantSlug: string;
}): string {
  const { template, order, customerName, customerPhone, restaurantSlug } = input;
  return renderTemplate(
    resolveTemplate(template, DEFAULT_PIX_CONFIRMED_TEMPLATE),
    buildMessagePlaceholders({ order, customerName, customerPhone, restaurantSlug }),
  );
}
