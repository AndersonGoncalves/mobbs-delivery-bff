import { Schema, model } from 'mongoose';

const customerReferralCodeSchema = new Schema(
  {
    _id: { type: String, required: true },
    code: { type: String, required: true, unique: true },
  },
  { _id: false },
);

export const CustomerReferralCodeModel = model('CustomerReferralCode', customerReferralCodeSchema, 'customer_referral_codes');
