import { IRawMaterial } from '../entities/raw-material.entity';

export interface IRawMaterialRepository {
  listByRestaurant(restaurantId: string): Promise<IRawMaterial[]>;
  create(restaurantId: string, name: string, priceDelta: number): Promise<IRawMaterial>;
  update(id: string, name: string, priceDelta: number): Promise<IRawMaterial>;
  setActive(id: string, isActive: boolean): Promise<IRawMaterial>;
  findById(id: string): Promise<IRawMaterial | null>;
}
