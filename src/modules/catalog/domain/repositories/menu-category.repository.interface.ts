import { IMenuCategory, IMenuCategoryWithProducts } from '../entities/menu-category.entity';

export interface IMenuCategoryRepository {
  /** REQ-1: categorias do restaurante, com produtos (versão leve), ordenadas por `sortOrder`. */
  listByRestaurant(restaurantId: string): Promise<IMenuCategoryWithProducts[]>;

  /** REQ-1 (retaguarda) — nova categoria entra no fim (`sortOrder` = quantidade atual). */
  create(restaurantId: string, name: string): Promise<IMenuCategory>;

  update(id: string, name: string): Promise<IMenuCategory>;

  /** REQ-1: `orderedIds` é a nova ordem completa — `sortOrder` de cada categoria = seu índice. */
  reorder(restaurantId: string, orderedIds: string[]): Promise<IMenuCategory[]>;

  findById(id: string): Promise<IMenuCategory | null>;
}
