import { IRestaurant } from '../entities/restaurant.entity';

export interface IRestaurantRepository {
  findBySlug(slug: string): Promise<IRestaurant | null>;
}
