import { Schema, model } from 'mongoose';

// specs/0113-parametrizacao-faixas-cobranca — documento único (sempre o mesmo `_id`, mesmo padrão
// de `_id` customizado do `restaurant.mongoose.model.ts`, mas sem gerador: só existe um
// documento desta coleção).
export const BILLING_SETTINGS_SINGLETON_ID = 'singleton';

const billingSettingsSchema = new Schema(
  {
    _id: { type: String },
    freeLimitCents: { type: Number, required: true },
    proLimitCents: { type: Number, required: true },
    proMonthlyPriceCents: { type: Number, required: true },
    premiumMonthlyPriceCents: { type: Number, required: true },
    annualMultiplier: { type: Number, required: true },
  },
  { _id: false, timestamps: true },
);

export const BillingSettingsModel = model('BillingSettings', billingSettingsSchema, 'billingSettings');
