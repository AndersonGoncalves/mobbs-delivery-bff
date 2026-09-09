import { IMenuCategoryWithProducts } from '../entities/menu-category.entity';

export interface IMenuCategoryRepository {
  /** REQ-1: categorias do restaurante, com produtos (versão leve), ordenadas por `sortOrder`. */
  listByRestaurant(restaurantId: string): Promise<IMenuCategoryWithProducts[]>;
}
