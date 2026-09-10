import { IOrder, IOrderItem, ISalesSummary, OrderStatus, OrderType, PaymentMethod } from '../entities/order.entity';

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
  /** specs/0022-cupons-desconto REQ-2/REQ-4 — ver `IOrder.couponCode`. */
  couponCode?: string;
}

export interface IOrderRepository {
  create(input: NewOrderInput): Promise<IOrder>;

  /** REQ-1 (`specs/0006-acompanhamento-pedido`) — mais recente primeiro. */
  findManyByCustomer(customerId: string): Promise<IOrder[]>;

  findById(id: string): Promise<IOrder | null>;

  /** REQ-8 — resolve pelo token opaco, nunca pelo `id` sequencial/interno. */
  findByTrackingToken(token: string): Promise<IOrder | null>;

  /**
   * REQ-6 — quem decide **se** a transição é permitida (dono do pedido, status atual) é o
   * controller (`OrdersController`); este método só aplica a mudança e empilha em
   * `statusHistory`. `reason` (specs/0008-acompanhamento-vendas REQ-3) só é usado quando
   * `status === 'cancelado'` pela retaguarda.
   */
  updateStatus(id: string, status: OrderStatus, changedBy?: string, reason?: string): Promise<IOrder>;

  /**
   * specs/0008-acompanhamento-vendas REQ-1 — pedidos em andamento (exclui `entregue`/
   * `cancelado`) do restaurante do operador logado, mais antigo primeiro (fila de atendimento —
   * diferente de `findManyByCustomer`, que é histórico e por isso mais recente primeiro).
   */
  findActiveByRestaurant(restaurantId: string): Promise<IOrder[]>;

  /** REQ-4 — agregado por período, calculado on demand, nunca persistido. */
  getSalesSummary(restaurantId: string, periodStart: Date, periodEnd: Date): Promise<ISalesSummary>;

  /**
   * specs/0016-clientes-retaguarda REQ-3 — histórico de pedidos de um cliente **só neste
   * restaurante** (nunca cruza com pedidos do mesmo `Customer` em outro restaurante, já que
   * `Customer` é global — `docs/architecture/data-model.md`); mais recente primeiro, mesmo
   * critério de `findManyByCustomer`.
   */
  findManyByCustomerAndRestaurant(customerId: string, restaurantId: string): Promise<IOrder[]>;

  /**
   * specs/0022-cupons-desconto REQ-6 — quantos pedidos deste cliente, neste restaurante, já
   * usaram este código de cupom (`Order.couponCode`) — usado por `CouponsController.validate` e
   * por `POST /orders` pra aplicar o limite de uso por cliente. Conta todos os pedidos
   * independente de status (a spec não distingue pedido cancelado como "não usou o cupom").
   */
  countByCustomerAndCoupon(restaurantId: string, customerId: string, couponCode: string): Promise<number>;
}
