/** specs/0043-programa-indicacao REQ-4 — recompensa fixa de R$ 100,00 por indicação nesta v1. */
export const REFERRAL_REWARD_CENTS = 10000;

export interface IReferral {
  id: string;
  referrerRestaurantId: string;
  referredRestaurantId: string;
  rewardCents: number;
  createdAt: Date;
}
