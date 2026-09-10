import { IPurchaseOrder } from '../entities/purchase-order.entity';

export interface IReceivePurchaseOrderService {
  /**
   * specs/0015-estoque-compras REQ-3/REQ-7 — marca o pedido como `recebido` e, pra cada item,
   * soma `RawMaterial.currentStock` e gera uma `StockMovement` de entrada. Lança `NotFoundError`
   * (pedido inexistente/de outro restaurante) ou `ConflictError` (já `recebido`/`cancelado`).
   */
  receive(purchaseOrderId: string, restaurantId: string): Promise<IPurchaseOrder>;
}
