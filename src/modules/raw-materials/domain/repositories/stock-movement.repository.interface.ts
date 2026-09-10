import { CreateStockMovementInput, IStockMovement } from '../entities/stock-movement.entity';

export interface IStockMovementRepository {
  create(input: CreateStockMovementInput): Promise<IStockMovement>;
  /** REQ-6/AC-6 — ordem cronológica (mais antiga primeiro). */
  listByRawMaterial(rawMaterialId: string): Promise<IStockMovement[]>;
}
