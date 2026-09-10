import { ISupplier } from '../entities/supplier.entity';

export interface SupplierInput {
  name: string;
  document?: string;
  phone?: string;
  email?: string;
}

export interface ISupplierRepository {
  listByRestaurant(restaurantId: string): Promise<ISupplier[]>;
  findById(id: string): Promise<ISupplier | null>;
  create(restaurantId: string, input: SupplierInput): Promise<ISupplier>;
  update(id: string, input: SupplierInput): Promise<ISupplier>;
  setActive(id: string, isActive: boolean): Promise<ISupplier>;
}
