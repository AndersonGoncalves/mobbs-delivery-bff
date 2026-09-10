/**
 * docs/architecture/data-model.md §RawMaterial — catálogo de ingredientes do restaurante,
 * reaproveitado como opção em vários produtos (`specs/0007-cadastro-produtos` REQ-5).
 *
 * `unit`/`currentStock`/`minimumStockAlert` (controle de estoque) chegam com
 * `specs/0015-estoque-compras`, que é quem de fato os usa — mesmo padrão incremental já usado
 * em `Restaurant` (`deliveryFeeCents`/`estimatedDeliveryMinutes` chegaram só quando a spec que os
 * usava foi implementada).
 */
export interface IRawMaterial {
  id: string;
  restaurantId: string;
  name: string;
  priceDelta: number;
  isActive: boolean;
  /** specs/0015-estoque-compras — unidade de medida, texto livre nesta v1 (ex.: "kg", "un"). */
  unit: string;
  /** specs/0015-estoque-compras — nunca editado direto, só via `StockMovement` ($inc atômico). */
  currentStock: number;
  /** specs/0015-estoque-compras — abaixo desse valor, retaguarda sinaliza "estoque baixo". */
  minimumStockAlert?: number;
}
