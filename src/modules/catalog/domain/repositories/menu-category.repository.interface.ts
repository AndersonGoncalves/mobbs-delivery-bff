import { IMenuCategory, IMenuCategoryWithProducts } from '../entities/menu-category.entity';

export interface IMenuCategoryRepository {
  /** REQ-1: categorias do restaurante, com produtos (versão leve), ordenadas por `sortOrder`. */
  listByRestaurant(restaurantId: string): Promise<IMenuCategoryWithProducts[]>;

  /** REQ-1 (retaguarda) — nova categoria entra no fim (`sortOrder` = quantidade atual). */
  create(restaurantId: string, name: string): Promise<IMenuCategory>;

  update(id: string, name: string): Promise<IMenuCategory>;

  /** specs/0061-categoria-ativa-inativa — mesmo padrão de `IProductRepository.setAvailable`. */
  setActive(id: string, isActive: boolean): Promise<IMenuCategory>;

  /** REQ-1: `orderedIds` é a nova ordem completa — `sortOrder` de cada categoria = seu índice. */
  reorder(restaurantId: string, orderedIds: string[]): Promise<IMenuCategory[]>;

  findById(id: string): Promise<IMenuCategory | null>;

  /**
   * specs/0032-ajustes-diversos-rating-taxa-entrega REQ-5 — exclusão real, só "dono"
   * (`CatalogController`). Bloqueada pelo controller se a categoria tiver produtos (mesmo
   * raciocínio de `IProductRepository.remove`, que também não decide sozinho a regra de
   * bloqueio).
   */
  remove(id: string): Promise<void>;
}
