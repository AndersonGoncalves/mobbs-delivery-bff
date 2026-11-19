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
    // Pedido explícito do usuário (18/11/2026) — `required: false` porque o documento singleton já
    // existente em produção não tem estes dois campos ainda; `get()` no repositório cobre o
    // fallback pro default até a próxima vez que alguém salvar o formulário.
    commercialEmail: { type: String, required: false },
    financialEmail: { type: String, required: false },
    businessHours: { type: String, required: true },
    trainingPriceCents: { type: Number, required: true, min: 0 },
    trainingUnlimitedItems: { type: Boolean, required: true },
    trainingIncludedItems: { type: Number, required: true, min: 0 },
    trainingExtraItemPriceCents: { type: Number, required: true, min: 0 },
  },
  { _id: false, timestamps: true },
);

export const SupportSettingsModel = model('SupportSettings', supportSettingsSchema, 'supportSettings');
