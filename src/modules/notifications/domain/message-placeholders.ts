import { IOrder } from '../../orders/domain/entities/order.entity';
import { buildPaymentBlock, buildTrackingLink, formatCurrency, paymentMethodLabel, renderItem } from './whatsapp-message-helpers';

const ORDER_TYPE_LABELS: Record<IOrder['orderType'], string> = {
  delivery: 'Entrega',
  pickup: 'Retirada',
};

export interface MessagePlaceholdersInput {
  order: IOrder;
  customerName: string;
  customerPhone?: string;
  restaurantSlug: string;
  /** copia-e-cola Pix do pedido (`buildOrderPixCode`). */
  pixCode?: string;
  /** só o recibo conhece a operadora do cartão (`Order` não guarda). */
  cardBrand?: string;
}

/**
 * specs/0069 — vocabulário ÚNICO (em português) de placeholders de TODAS as mensagens de
 * WhatsApp editáveis na retaguarda (recibo, aviso ao restaurante, pedido confirmado, Pix
 * confirmado). Valor vazio = a linha do template que só tem esse placeholder é omitida
 * (`renderTemplate`), então `{desconto}`/`{previsaoEntrega}` podem ficar em linhas opcionais.
 */
export function buildMessagePlaceholders(input: MessagePlaceholdersInput): Record<string, string> {
  const { order, customerName, customerPhone, restaurantSlug, pixCode, cardBrand } = input;

  const enderecoEntrega =
    order.orderType === 'delivery'
      ? `Endereço: ${order.deliveryAddress ?? 'não informado'}\nTaxa de entrega: ${formatCurrency(order.deliveryFee)}`
      : 'Retirada no local.';

  return {
    numeroPedido: String(order.orderNumber),
    nomeCliente: customerName,
    telefoneCliente: customerPhone ?? '',
    itens: order.items.map(renderItem).join('\n'),
    subtotal: formatCurrency(order.subtotal),
    enderecoEntrega,
    taxaEntrega: formatCurrency(order.deliveryFee),
    previsaoEntrega: order.estimatedDeliveryAt ? new Date(order.estimatedDeliveryAt).toLocaleString('pt-BR') : '',
    desconto: order.discount > 0 ? `-${formatCurrency(order.discount)}` : '',
    total: formatCurrency(order.total),
    tipoPedido: ORDER_TYPE_LABELS[order.orderType],
    formaPagamento: paymentMethodLabel(order.paymentMethod),
    pagamento: buildPaymentBlock({ order, cardBrand, pixCode }),
    pixCopiaECola: pixCode ?? '',
    linkAcompanhamento: buildTrackingLink(restaurantSlug, order.trackingToken),
  };
}
