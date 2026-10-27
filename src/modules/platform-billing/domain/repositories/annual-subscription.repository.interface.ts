import type { IAnnualSubscription } from '../entities/annual-subscription.entity';

export interface IAnnualSubscriptionRepository {
  /** A assinatura anual ATIVA do restaurante (`renewalActive: true`), se houver — nunca mais de
   * uma por restaurante (REQ-13 "impedir adesões simultâneas duplicadas"). */
  findActiveByRestaurantId(restaurantId: string): Promise<IAnnualSubscription | null>;
  /** Qualquer assinatura (ativa ou já cancelada) — histórico (REQ-32). */
  findByRestaurantId(restaurantId: string): Promise<IAnnualSubscription[]>;
  create(restaurantId: string, joinedAt: Date): Promise<IAnnualSubscription>;
  cancelRenewal(id: string, cancelledAt: Date, cancelledBy: string): Promise<IAnnualSubscription>;
}
