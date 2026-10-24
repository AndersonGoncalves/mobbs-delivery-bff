import { Schema, model } from 'mongoose';
import type { SupportSettings } from '../domain/support-settings';

export const SUPPORT_SETTINGS_SINGLETON_ID = 'singleton';

const supportSettingsSchema = new Schema<SupportSettings & { _id: string }>(
  {
    _id: { type: String },
    whatsapp: { type: String, required: true },
    commercialWhatsapp: { type: String, required: true },
    financialWhatsapp: { type: String, required: true },
    email: { type: String, required: true },
    businessHours: { type: String, required: true },
    trainingPriceCents: { type: Number, required: true, min: 0 },
    trainingUnlimitedItems: { type: Boolean, required: true },
    trainingIncludedItems: { type: Number, required: true, min: 0 },
    trainingExtraItemPriceCents: { type: Number, required: true, min: 0 },
  },
  { _id: false, timestamps: true },
);

export const SupportSettingsModel = model('SupportSettings', supportSettingsSchema, 'supportSettings');
