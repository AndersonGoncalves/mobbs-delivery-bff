import { IRestaurant } from '../../restaurants/domain/entities/restaurant.entity';
import { IOrder } from './entities/order.entity';
import { buildPixBrCode } from './pix-br-code-builder';

/**
 * specs/0069 — copia-e-cola Pix (BR Code) de um pedido: o MESMO código que a tela de detalhe do
 * pedido do app mostra (`GET /orders/:id`) e que o recibo de WhatsApp passa a enviar no lugar da
 * chave Pix crua. `undefined` quando a forma de pagamento não é Pix ou o restaurante não tem
 * chave cadastrada.
 */
export function buildOrderPixCode(
  restaurant: Pick<IRestaurant, 'pixKey' | 'pixBeneficiaryName' | 'name' | 'address'>,
  order: Pick<IOrder, 'id' | 'total' | 'paymentMethod'>,
): string | undefined {
  if (order.paymentMethod !== 'pix' || !restaurant.pixKey) return undefined;
  return buildPixBrCode({
    pixKey: restaurant.pixKey,
    merchantName: restaurant.pixBeneficiaryName || restaurant.name,
    merchantCity: restaurant.address?.city ?? 'BRASIL',
    amount: order.total,
    txId: order.id,
  });
}
