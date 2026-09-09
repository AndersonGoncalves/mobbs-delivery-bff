export type OrderType = 'delivery' | 'pickup';

export type PaymentMethod = 'creditCard' | 'debitCard' | 'pix' | 'cash' | 'bankTransfer';

export type OrderStatus = 'aguardandoConfirmacao' | 'confirmado' | 'emPreparo' | 'saiuParaEntrega' | 'entregue' | 'cancelado';

export type PaymentStatus = 'pendente' | 'aprovado' | 'recusado' | 'estornado';

/**
 * docs/architecture/data-model.md §OrderItemSelection — mesma árvore de `CartItemSelection`
 * (specs/0004-carrinho), mas com nomes e `priceDelta` **congelados** (snapshot). Sem
 * `groupId`/`optionId` (diferente de `CartItemSelection`): não é mais editável depois de criado,
 * então os ids de grupo/opção do cardápio não servem pra nada aqui.
 */
export interface IOrderItemSelection {
  groupName: string;
  optionName: string;
  priceDelta: number;
  nestedSelections?: IOrderItemSelection[];
}

/** docs/architecture/data-model.md §OrderItem — cópia congelada de `CartItem` (specs/0004). */
export interface IOrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  selections?: IOrderItemSelection[];
  unitPrice: number;
  notes?: string;
}

export interface IOrderStatusHistory {
  status: OrderStatus;
  changedAt: string;
  changedBy?: string;
}

/**
 * docs/architecture/data-model.md §Order. `deliveryAddress` aqui é uma **string simplificada**
 * nesta v1 (não o `Address` estruturado de `specs/0011-perfil-cliente`, que ainda não existe —
 * ver `specs/0005-checkout/tasks.md`, nota de implementação) — quando `0011` chegar, revisitar
 * pra usar `IRestaurantAddress`-like shape em vez de string livre.
 */
export interface IOrder {
  id: string;
  orderNumber: number;
  trackingToken: string;
  customerId: string;
  restaurantId: string;
  items: IOrderItem[];
  orderType: OrderType;
  deliveryAddress?: string;
  notes?: string;
  status: OrderStatus;
  statusHistory: IOrderStatusHistory[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  createdAt: string;
  estimatedDeliveryAt?: string;
}

/**
 * docs/architecture/data-model.md §Payment — registro separado do `Order` (usado por
 * `specs/0008-acompanhamento-vendas` mais adiante); o cliente nunca lê isso de volta nesta v1,
 * só o BFF grava pra retaguarda.
 */
export interface IPayment {
  id: string;
  orderId: string;
  method: PaymentMethod;
  cardBrand?: string;
  status: PaymentStatus;
  amount: number;
  externalReference?: string;
}
