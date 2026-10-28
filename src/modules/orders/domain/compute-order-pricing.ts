import { IOrderItem } from './entities/order.entity';

export interface OrderPricingInput {
  items: Pick<IOrderItem, 'unitPrice' | 'quantity'>[];
  deliveryFee: number;
  discount: number;
  cashbackUsed: number;
}

export interface OrderPricingResult {
  subtotal: number;
  total: number;
}

/**
 * specs/0155-app-totem-autoatendimento (plan.md, ADR + REQ-15) — extraído de
 * `OrdersController` (handler `POST /orders`) pra ser reaproveitado pela criação de pedido do
 * totem (`TotemController`) sem duplicar a fórmula. REQ-15: subtotal/total **nunca** confiam no
 * valor mandado pelo cliente — sempre recalculados aqui, a partir de `unitPrice`/`quantity` já
 * congelados em cada item.
 */
export function computeOrderPricing(input: OrderPricingInput): OrderPricingResult {
  const subtotal = input.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const total = subtotal + input.deliveryFee - input.discount - input.cashbackUsed;
  return { subtotal, total };
}
