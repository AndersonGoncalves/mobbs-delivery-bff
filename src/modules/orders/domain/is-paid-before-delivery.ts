import { IOrder } from './entities/order.entity';

/**
 * specs/0213-caixa-pix-na-confirmacao + specs/0234-caixa-cartao-online-na-confirmacao — pedido já pago
 * quando é confirmado, então entra no caixa em "confirmado" (não em "entregue"):
 * - Pix (o dinheiro já caiu na confirmação);
 * - cartão online do APP DO CLIENTE (sem `source`), pago pelo Mercado Pago antes da confirmação.
 *
 * `creditCardOnline` do iFood/99Food/Keeta (com `source`) fica de fora: o repasse é da plataforma e
 * continua entrando no caixa na entrega (decisão do usuário, 28/11/2026).
 */
export function isPaidBeforeDelivery(order: Pick<IOrder, 'paymentMethod' | 'source'>): boolean {
  if (order.paymentMethod === 'pix') return true;
  return order.paymentMethod === 'creditCardOnline' && !order.source;
}
