import { IReferral } from '../entities/referral.entity';

export interface IReferralRepository {
  create(input: { referrerRestaurantId: string; referredRestaurantId: string; rewardCents: number }): Promise<IReferral>;
  findByReferrerRestaurantId(restaurantId: string): Promise<IReferral[]>;
  /** Soma de `rewardCents` de todas as indicações do restaurante (saldo a receber, specs/0043 REQ-5). */
  getBalanceCents(restaurantId: string): Promise<number>;
}
