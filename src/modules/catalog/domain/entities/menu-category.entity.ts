import { IProduct } from './product.entity';

/** docs/architecture/data-model.md §MenuCategory */
export interface IMenuCategory {
  id: string;
  restaurantId: string;
  name: string;
  sortOrder: number;
}

/** REQ-1: versão com produtos embutidos (sem `additionalGroups`) — resposta de listagem do cardápio. */
export interface IMenuCategoryWithProducts extends IMenuCategory {
  products: Omit<IProduct, 'additionalGroups'>[];
}
