/**
 * docs/architecture/data-model.md §PurchaseOrder/§PurchaseOrderItem — pedido de compra de
 * matéria-prima OU produto pronto pra revenda (ex. refrigerante) junto a um fornecedor
 * (specs/0015-estoque-compras REQ-2; produto pronto — pedido explícito do usuário, follow-up). Ao
 * ser marcado como `recebido`, gera `StockMovement` de entrada por item (REQ-3,
 * `ReceivePurchaseOrderService`).
 */
export type PurchaseOrderStatus = 'aberto' | 'recebido' | 'cancelado';

export interface IPurchaseOrderItem {
  /** Exatamente um entre `rawMaterialId`/`productId` é preenchido, nunca os dois. */
  rawMaterialId?: string;
  /** Pedido explícito do usuário (follow-up) — comprar um `Product` já pronto pra revenda. */
  productId?: string;
  /** Na `unit` do `RawMaterial` referenciado, ou unidade do próprio produto quando `productId`. */
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
