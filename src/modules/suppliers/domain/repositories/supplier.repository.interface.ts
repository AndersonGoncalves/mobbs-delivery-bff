import { ISupplier, ISupplierAddress } from '../entities/supplier.entity';

export interface SupplierInput {
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: ISupplierAddress;
}

export interface ISupplierRepository {
  listByRestaurant(restaurantId: string): Promise<ISupplier[]>;
  /** specs/0231-filtro-datas-contas-pedidos-compra REQ-2 — ids dos fornecedores do restaurante
   * cujo nome contém `search` (parcial, case-insensitive) — usado na busca de pedidos de compra. */
  findIdsByName(restaurantId: string, search: string): Promise<string[]>;
  findById(id: string): Promise<ISupplier | null>;
  create(restaurantId: string, input: SupplierInput): Promise<ISupplier>;
  update(id: string, input: SupplierInput): Promise<ISupplier>;
  setActive(id: string, isActive: boolean): Promise<ISupplier>;
}
