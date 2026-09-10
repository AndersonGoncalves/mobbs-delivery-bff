/**
 * docs/architecture/data-model.md §PurchaseOrder/§PurchaseOrderItem — pedido de compra de
 * matéria-prima junto a um fornecedor (specs/0015-estoque-compras REQ-2). Ao ser marcado como
 * `recebido`, gera `StockMovement` de entrada por item (REQ-3, `ReceivePurchaseOrderService`).
 */
export type PurchaseOrderStatus = 'aberto' | 'recebido' | 'cancelado';

export interface IPurchaseOrderItem {
  rawMaterialId: string;
  /** Na `unit` do `RawMaterial` referenciado. */
  quantity: number;
  /** Custo pago nesta compra — pode diferir de compra pra compra. */
  unitCost: number;
}

export interface IPurchaseOrder {
  id: string;
  restaurantId: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  items: IPurchaseOrderItem[];
  totalValue: number;
  createdAt: string;
  /** Preenchido quando `status` vira `recebido`. */
  receivedAt?: string;
}
