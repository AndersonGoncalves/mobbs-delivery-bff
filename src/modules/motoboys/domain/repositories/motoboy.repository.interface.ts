import { IMotoboy } from '../entities/motoboy.entity';

export interface MotoboyInput {
  name: string;
  whatsapp: string;
  canMarkAsDelivered: boolean;
}

export interface IMotoboyRepository {
  listByRestaurant(restaurantId: string): Promise<IMotoboy[]>;
  findById(id: string): Promise<IMotoboy | null>;
  create(restaurantId: string, input: MotoboyInput): Promise<IMotoboy>;
  update(id: string, input: MotoboyInput): Promise<IMotoboy>;
  setActive(id: string, isActive: boolean): Promise<IMotoboy>;
}
