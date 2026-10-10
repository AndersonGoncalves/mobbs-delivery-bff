import { TableWaiter } from '../entities/table-service.entity';

export interface ITableWaiterRepository {
  listByRestaurant(restaurantId: string): Promise<TableWaiter[]>;
  findById(id: string, restaurantId: string): Promise<TableWaiter | null>;
  create(restaurantId: string, name: string): Promise<TableWaiter>;
  update(id: string, restaurantId: string, name: string): Promise<TableWaiter | null>;
  remove(id: string, restaurantId: string): Promise<boolean>;
}