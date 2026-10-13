import { IRawMaterial } from '../entities/raw-material.entity';

/** specs/0026-selecao-clonar-excluir-busca-web REQ-7 — busca por nome (parcial) + ativo. */
export interface IRawMaterialListFilters {
  name?: string;
  isActive?: boolean;
}

export interface IRawMaterialRepository {
  listByRestaurant(restaurantId: string, filters?: IRawMaterialListFilters): Promise<IRawMaterial[]>;
  create(
    restaurantId: string,
    name: string,
    priceDelta: number,
    unit: string,
    minimumStockAlert?: number,
    description?: string,
    tracksStock?: boolean,
    // specs/0133-foto-materia-prima — 1 foto opcional, mesmo mecanismo de upload de `Product.imageUrl`.
    imageUrl?: string,
  ): Promise<IRawMaterial>;
  update(
    id: string,
    name: string,
    priceDelta: number,
    unit: string,
    minimumStockAlert?: number,
    description?: string,
    tracksStock?: boolean,
    imageUrl?: string,
  ): Promise<IRawMaterial>;
  setActive(id: string, isActive: boolean): Promise<IRawMaterial>;
  findById(id: string): Promise<IRawMaterial | null>;
  /** specs/0026-selecao-clonar-excluir-busca-web REQ-4 — exclusão real (diferente de setActive). */
  remove(id: string): Promise<void>;
  /**
   * specs/0015-estoque-compras REQ-3/REQ-5 — `$inc` atômico por documento em `currentStock`
   * (positivo soma, negativo subtrai); usado tanto pelo recebimento de `PurchaseOrder` quanto
   * pelo ajuste manual de estoque.
   */
  incrementStock(id: string, delta: number): Promise<IRawMaterial>;
  /** specs/0108 — decremento condicional; false quando não há saldo suficiente ou rastreamento desligado. */
  decrementStockIfAvailable(id: string, quantity: number, requireTracking?: boolean): Promise<boolean>;
}
