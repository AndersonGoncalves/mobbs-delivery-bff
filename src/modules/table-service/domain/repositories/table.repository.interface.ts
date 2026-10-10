import { RestaurantTable, TablePosition } from '../entities/table-service.entity';

export interface RestaurantTableInput {
  name: string;
  capacity?: number;
}

export interface IRestaurantTableRepository {
  listByRestaurant(restaurantId: string): Promise<RestaurantTable[]>;
  findById(id: string, restaurantId: string): Promise<RestaurantTable | null>;
  findByNormalizedName(restaurantId: string, normalizedName: string): Promise<RestaurantTable | null>;
  create(restaurantId: string, input: RestaurantTableInput): Promise<RestaurantTable>;
  createMany(restaurantId: string, inputs: RestaurantTableInput[]): Promise<RestaurantTable[]>;
  update(id: string, restaurantId: string, input: RestaurantTableInput): Promise<RestaurantTable | null>;
  deleteIfFree(id: string, restaurantId: string): Promise<boolean>;
  claimForOrder(id: string, restaurantId: string, orderId: string): Promise<boolean>;
  releaseFromOrder(id: string, restaurantId: string, orderId: string): Promise<boolean>;
  updatePosition(id: string, restaurantId: string, position: TablePosition): Promise<RestaurantTable | null>;
}