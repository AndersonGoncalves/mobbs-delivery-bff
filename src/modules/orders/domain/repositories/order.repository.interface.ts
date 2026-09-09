import { IOrder, IOrderItem, OrderType, PaymentMethod } from '../entities/order.entity';

/**
 * specs/0005-checkout REQ-2/REQ-5 — `create()` gera `orderNumber` (sequencial por
 * `restaurantId`) e `trackingToken` (aleatório) internamente, persiste o `Order` com
 * `status = 'aguardandoConfirmacao'` e grava o `Payment` correspondente (registro separado,
 * `docs/architecture/data-model.md` §Payment) — tudo responsabilidade da implementação de
 * persistência, não do controller.
 */
export interface NewOrderInput {
  customerId: string;
  restaurantId: string;
  items: IOrderItem[];
  orderType: OrderType;
  deliveryAddress?: string;
  notes?: string;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  cardBrand?: string;
}

export interface IOrderRepository {
  create(input: NewOrderInput): Promise<IOrder>;
}
