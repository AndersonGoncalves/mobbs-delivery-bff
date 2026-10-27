import type { IBillingPayer } from '../entities/billing-payer.entity';

export interface IBillingPayerRepository {
  findByRestaurantId(restaurantId: string): Promise<IBillingPayer | null>;
  /** Upsert por `restaurantId` — um pagador por restaurante, sempre o mesmo documento. */
  save(restaurantId: string, data: Omit<IBillingPayer, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>): Promise<IBillingPayer>;
}
