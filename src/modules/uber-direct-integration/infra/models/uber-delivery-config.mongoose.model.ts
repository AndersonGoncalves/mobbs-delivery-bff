import { Schema, model } from 'mongoose';

// specs/0121-integracao-uber-entregas — um documento por restaurante (ver `plan.md`), mesmo
// padrão de `fiscalConfig` (specs/0091): chave `restaurantId`, não um singleton de plataforma.
const uberDeliveryConfigSchema = new Schema(
  {
    restaurantId: { type: String, required: true, unique: true },
    customerId: { type: String, required: true },
    clientId: { type: String, required: true },
    clientSecret: { type: String, required: true },
    originZipCode: { type: String, required: true },
    webhookToken: { type: String, required: true },
  },
  { timestamps: true },
);

export const UberDeliveryConfigModel = model('UberDeliveryConfig', uberDeliveryConfigSchema, 'uberDeliveryConfig');
