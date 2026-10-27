import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const billingSettingsVersionSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    freeLimitCents: { type: Number, required: true },
    proLimitCents: { type: Number, required: true },
    proMonthlyPriceCents: { type: Number, required: true },
    premiumMonthlyPriceCents: { type: Number, required: true },
    annualMultiplier: { type: Number, required: true },
    effectiveFrom: { type: Date, required: true },
    createdBy: { type: String, required: true },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);

billingSettingsVersionSchema.index({ effectiveFrom: 1 });

export const BillingSettingsVersionModel = model('BillingSettingsVersion', billingSettingsVersionSchema, 'billingSettingsVersion');
