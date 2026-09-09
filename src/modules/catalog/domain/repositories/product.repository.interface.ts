import { IProduct } from '../entities/product.entity';

export interface IProductRepository {
  /** REQ-3: produto completo (com `additionalGroups`) — `null` se o `id` não existir. */
  findById(id: string): Promise<IProduct | null>;
}
