/** specs/0110 REQ-6/REQ-7 — recompensa fixa de R$ 100,00 por indicação. */
export const REFERRAL_REWARD_CENTS = 10000;

/** specs/0110 REQ-6/REQ-7 — `pendente` conta no saldo; `pago` foi quitado pelo dono da plataforma. */
export type ReferralStatus = 'pendente' | 'pago';

export interface IReferral {
  id: string;
  referrerCustomerId: string;
  referredRestaurantId: string;
  rewardCents: number;
  status: ReferralStatus;
  createdAt: Date;
  paidAt?: Date;
}
