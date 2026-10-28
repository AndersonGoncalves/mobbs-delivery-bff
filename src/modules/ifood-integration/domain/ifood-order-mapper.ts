import { IOrderItem } from '../../orders/domain/entities/order.entity';
import { NewOrderInput } from '../../orders/domain/repositories/order.repository.interface';
import { IFoodOrderDetails } from '../infra/ifood-client';

/**
 * specs/0090-integracao-ifood REQ-3 — mapeia o payload de pedido do iFood pro `NewOrderInput`
 * interno. `customerId`/`restaurantId` são resolvidos fora (precisam de um `Customer` já
 * persistido e do restaurante da integração, respectivamente — ver `IFoodPollingWorker`), por
 * isso ficam fora da assinatura, passados como parâmetros.
 */
export function mapIFoodOrderToNewOrderInput(
  ifoodOrder: IFoodOrderDetails,
  restaurantId: string,
  customerId: string,
): Omit<NewOrderInput, 'customerId' | 'restaurantId' | 'id'> & { customerId: string; restaurantId: string } {
  const items: IOrderItem[] = ifoodOrder.items.map((item) => ({
    id: item.id,
    productId: item.id,
    productName: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice.value,
    notes: item.observations,
  }));

  const subtotal = ifoodOrder.items.reduce((sum, item) => sum + item.totalPrice.value, 0);
  const deliveryFee = ifoodOrder.total.deliveryFee?.value ?? 0;
  const total = ifoodOrder.total.orderAmount.value;

  return {
    customerId,
    restaurantId,
    items,
    // iFood só manda pedido de entrega/retirada (nunca mesa) — `INDOOR` (salão deles) fora de
    // escopo desta v1 (plan.md "Fora de escopo").
    orderType: ifoodOrder.orderType === 'DELIVERY' ? 'delivery' : 'pickup',
    source: 'ifood',
    deliveryAddress: ifoodOrder.delivery?.deliveryAddress?.formattedAddress,
    subtotal,
    deliveryFee,
    discount: 0,
    total,
    // Pedido do iFood já vem pago/garantido pela própria plataforma deles (nunca cobrado por nós)
    // — `creditCardOnline` é o valor existente mais próximo de "pagamento online fora do nosso
    // controle direto" (mesmo espírito do Checkout Pro/Asaas Checkout, sem cobrar de novo).
    paymentMethod: 'creditCardOnline',
  };
}
