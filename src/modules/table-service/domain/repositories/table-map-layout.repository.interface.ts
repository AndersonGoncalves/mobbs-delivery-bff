import { TableMapDecoration, TableMapLayout } from '../entities/table-service.entity';

export interface ITableMapLayoutRepository {
  getByRestaurant(restaurantId: string): Promise<TableMapLayout>;
  save(restaurantId: string, decorations: TableMapDecoration[], spendingLimit?: number | null): Promise<TableMapLayout>;
}