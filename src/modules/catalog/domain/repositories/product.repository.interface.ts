import { IProduct, IProductAdditionalGroup } from '../entities/product.entity';

export type NewProductInput = {
  menuCategoryId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  price: number;
  isAvailable: boolean;
  additionalGroups: IProductAdditionalGroup[];
};

export type ProductUpdateInput = Partial<NewProductInput>;

/** REQ-7 (`specs/0007-cadastro-produtos`) — produto ativo que referencia um `RawMaterial`. */
export interface IAffectedProduct {
  id: string;
  name: string;
}

export interface IProductRepository {
  /** REQ-3: produto completo (com `additionalGroups`) — `null` se o `id` não existir. */
  findById(id: string): Promise<IProduct | null>;

  /** REQ-2 (retaguarda) — todos os produtos do restaurante do operador, com `additionalGroups`. */
  listByRestaurant(restaurantId: string): Promise<IProduct[]>;

  create(restaurantId: string, input: NewProductInput): Promise<IProduct>;

  update(id: string, input: ProductUpdateInput): Promise<IProduct>;

  setAvailable(id: string, isAvailable: boolean): Promise<IProduct>;

  /**
   * REQ-7: produtos **ativos** do restaurante cuja árvore de `additionalGroups` (recursiva)
   * referencia `rawMaterialId` em algum nível — usado pra avisar antes de desativar um
   * `RawMaterial`.
   */
  findActiveByRawMaterialId(restaurantId: string, rawMaterialId: string): Promise<IAffectedProduct[]>;
}
