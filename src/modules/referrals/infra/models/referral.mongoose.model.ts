import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const referralSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    // specs/0110 — indicação de cliente. Documentos antigos (indicação entre restaurantes, specs/0043)
    // não têm este campo e ficam fora de saldo e listagem.
    referrerCustomerId: { type: String, required: true },
    referredRestaurantId: { type: String, required: true, unique: true },
    rewardCents: { type: Number, required: true },
    status: { type: String, enum: ['pendente', 'pago'], default: 'pendente' },
    createdAt: { type: Date, default: () => new Date() },
    paidAt: { type: Date },
  },
  { _id: false },
);

referralSchema.index({ referrerCustomerId: 1 });

export const ReferralModel = model('Referral', referralSchema, 'referrals');
