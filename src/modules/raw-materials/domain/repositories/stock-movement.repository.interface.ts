import { CreateStockMovementInput, IStockMovement } from '../entities/stock-movement.entity';

export interface IStockMovementRepository {
  create(input: CreateStockMovementInput): Promise<IStockMovement>;
  /** REQ-6/AC-6 — ordem cronológica (mais antiga primeiro). */
  listByRawMaterial(rawMaterialId: string): Promise<IStockMovement[]>;
  listByProduct(productId: string): Promise<IStockMovement[]>;
  findByOperationId(restaurantId: string, operationId: string): Promise<IStockMovement | null>;
  /**
   * Achado crítico de auditoria pré-produção (31/10/2026) — "reserva de estoque no checkout:
   * N+1 sequencial por item/adicional": `StockReservationService` usa pra checar TODAS as
   * reservas existentes/rollbacks de um pedido de uma vez, num só round-trip, em vez de até duas
   * chamadas de `findByOperationId` por item/adicional.
   */
  findManyByOperationIds(restaurantId: string, operationIds: string[]): Promise<IStockMovement[]>;
}
