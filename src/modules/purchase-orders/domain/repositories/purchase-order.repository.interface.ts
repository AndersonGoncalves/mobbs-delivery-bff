import { IPurchaseOrder, IPurchaseOrderItem } from '../entities/purchase-order.entity';

export interface IPurchaseOrderRepository {
  listByRestaurant(restaurantId: string): Promise<IPurchaseOrder[]>;
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
}
