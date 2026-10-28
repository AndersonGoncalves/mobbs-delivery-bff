import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import { OrderStatus, PaymentMethod } from './entities/order.entity';

/**
 * specs/0155-app-totem-autoatendimento (plan.md, ADR + REQ-15) — extraído de `OrdersController`
 * (handler `POST /orders`) pra o totem reaproveitar a mesma regra de confirmação automática por
 * forma de pagamento (`specs/0151-confirmacao-automatica-por-forma-pagamento`), sem duplicar:
 * Pix e cartão online **nunca** nascem confirmados (só depois do pagamento aprovado — webhook ou
 * confirmação manual do operador); as demais formas nascem `'confirmado'` direto quando a forma
 * escolhida está em `autoConfirmPaymentMethods`. `undefined` = nasce `'aguardandoConfirmacao'`
 * (default do repositório).
 */
export function resolveInitialOrderStatus(
  paymentMethod: PaymentMethod,
  restaurant: Pick<IRestaurant, 'autoConfirmPaymentMethods'>,
): OrderStatus | undefined {
  if (paymentMethod === 'pix' || paymentMethod === 'creditCardOnline') return undefined;
  return restaurant.autoConfirmPaymentMethods?.includes(paymentMethod) ? 'confirmado' : undefined;
}
