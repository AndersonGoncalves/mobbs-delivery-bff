import { Schema, model } from 'mongoose';

// specs/0091-integracao-fiscal-focusnfe — um documento por restaurante (ver `plan.md`); diferente
// de `billing-settings.mongoose.model.ts` (documento único de plataforma), aqui a chave é
// `restaurantId`, não um `_id` singleton fixo.
const fiscalConfigSchema = new Schema(
  {
    restaurantId: { type: String, required: true, unique: true },
    focusNfeToken: { type: String, required: true },
    environment: { type: String, enum: ['homologacao', 'producao'], required: true },
    documentType: { type: String, enum: ['nfce', 'cfe', 'nfe'], required: true },
    productionEnabled: { type: Boolean, required: true, default: false },
    webhookToken: { type: String, required: true },
    cnpj: { type: String, required: true },
  },
  { timestamps: true },
);

export const FiscalConfigModel = model('FiscalConfig', fiscalConfigSchema, 'fiscalConfig');
