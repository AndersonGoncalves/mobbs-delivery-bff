/**
 * docs/architecture/data-model.md §StockMovement — toda mudança em `RawMaterial.currentStock`
 * fica registrada aqui (specs/0015-estoque-compras REQ-3/REQ-5/REQ-6); `currentStock` nunca é
 * editado direto.
 *
 * `ajuste` fica reservado no enum (mesma forma documentada em `data-model.md`), mas não é
 * produzido por nenhum fluxo desta v1: como `quantity` é sempre positivo e é o `type` que define
 * se soma ou subtrai de `currentStock` (nota de `data-model.md`), um ajuste manual precisa
 * indicar a direção — por isso REQ-5 (ajuste manual "entrada ou saída") grava `type: 'entrada'`
 * ou `type: 'saida'`, igual ao recebimento automático de compra; ver "Notas de implementação" em
 * `specs/0015-estoque-compras/tasks.md`.
 */
export type StockMovementType = 'entrada' | 'saida' | 'ajuste';

export interface IStockMovement {
  id: string;
  restaurantId: string;
  /** Exatamente um entre `rawMaterialId`/`productId` é preenchido, nunca os dois (v1: só rawMaterialId). */
  rawMaterialId?: string;
  productId?: string;
  type: StockMovementType;
  quantity: number;
  reason?: string;
  purchaseOrderId?: string;
  createdAt: string;
  createdBy?: string;
}

export interface CreateStockMovementInput {
  restaurantId: string;
  rawMaterialId?: string;
  productId?: string;
  type: StockMovementType;
  quantity: number;
  reason?: string;
  purchaseOrderId?: string;
  createdBy?: string;
}
