import { IRawMaterial } from '../entities/raw-material.entity';

export interface IRawMaterialRepository {
  listByRestaurant(restaurantId: string): Promise<IRawMaterial[]>;
  create(
    restaurantId: string,
    name: string,
    priceDelta: number,
    unit: string,
    minimumStockAlert?: number,
  ): Promise<IRawMaterial>;
  update(
    id: string,
    name: string,
    priceDelta: number,
    unit: string,
    minimumStockAlert?: number,
  ): Promise<IRawMaterial>;
  setActive(id: string, isActive: boolean): Promise<IRawMaterial>;
  findById(id: string): Promise<IRawMaterial | null>;
  /**
   * specs/0015-estoque-compras REQ-3/REQ-5 — `$inc` atômico por documento em `currentStock`
   * (positivo soma, negativo subtrai); usado tanto pelo recebimento de `PurchaseOrder` quanto
   * pelo ajuste manual de estoque.
   */
  incrementStock(id: string, delta: number): Promise<IRawMaterial>;
}
