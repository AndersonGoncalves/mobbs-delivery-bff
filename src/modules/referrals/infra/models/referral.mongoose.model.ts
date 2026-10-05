import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const referralSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    referrerRestaurantId: { type: String, required: true },
    referredRestaurantId: { type: String, required: true, unique: true },
    rewardCents: { type: Number, required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

referralSchema.index({ referrerRestaurantId: 1 });

export const ReferralModel = model('Referral', referralSchema, 'referrals');
