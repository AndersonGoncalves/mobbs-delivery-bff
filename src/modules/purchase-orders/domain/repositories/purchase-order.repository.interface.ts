import { IPurchaseOrder, IPurchaseOrderItem } from '../entities/purchase-order.entity';
import { PurchaseOrderListFilters } from '../build-purchase-order-list-query';

export interface IPurchaseOrderRepository {
  /** specs/0231-filtro-datas-contas-pedidos-compra — `filters` opcional; sem ele, o default de
   * `buildPurchaseOrderListQuery` (em aberto + últimos 12 meses). */
  listByRestaurant(restaurantId: string, filters?: PurchaseOrderListFilters): Promise<IPurchaseOrder[]>;
  /** specs/0231 REQ-5 — mesma query de `listByRestaurant`, paginada, com o total real. */
  listByRestaurantPage(
    restaurantId: string,
    pagination: { skip: number; limit: number },
    filters?: PurchaseOrderListFilters,
  ): Promise<{ items: IPurchaseOrder[]; total: number }>;
  findById(id: string): Promise<IPurchaseOrder | null>;
  create(restaurantId: string, supplierId: string, items: IPurchaseOrderItem[]): Promise<IPurchaseOrder>;
  /**
   * specs/0015-estoque-compras REQ-3/REQ-7 — compare-and-swap atômico por documento
   * (`status: 'aberto'` no filtro): devolve `null` quando o pedido já está `recebido`/`cancelado`
   * (ou não existe), garantindo que o recebimento nunca é aplicado duas vezes mesmo sob
   * concorrência — não depende de transação multi-documento do Mongo (indisponível neste
   * ambiente, MongoDB standalone sem replica set, `docs/architecture/patterns.md` §16.6.1).
   */
  markAsReceivedIfOpen(id: string, receivedAt: Date): Promise<IPurchaseOrder | null>;
  /**
   * specs/0138-ajustes-compras-faturamento-home-mapa REQ-2/REQ-3 — mesmo compare-and-swap de
   * `markAsReceivedIfOpen`, agora filtrando `status: { $ne: 'recebido' }` (um pedido `'cancelado'`
   * também pode ter os itens corrigidos, só `'recebido'` é definitivo): devolve `null` quando o
   * pedido já está `'recebido'` (ou não existe), garantindo que a edição nunca é aplicada depois
   * do recebimento mesmo sob concorrência.
   */
  updateItemsIfNotReceived(id: string, supplierId: string, items: IPurchaseOrderItem[]): Promise<IPurchaseOrder | null>;
}
