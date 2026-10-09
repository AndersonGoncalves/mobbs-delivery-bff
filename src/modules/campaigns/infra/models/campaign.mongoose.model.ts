import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const campaignSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    message: { type: String, required: true },
    imageUrl: { type: String },
    campaignCode: { type: String, required: true },
    // Pedido explícito do usuário (follow-up) — clientes excluídos deste disparo.
    excludedCustomerIds: { type: [String], required: true, default: [] },
    status: { type: String, enum: ['sending', 'completed'], required: true, default: 'sending' },
    totalRecipients: { type: Number, required: true, default: 0 },
    sentCount: { type: Number, required: true, default: 0 },
    failedCount: { type: Number, required: true, default: 0 },
    completedAt: { type: Date },
  },
  { _id: false, timestamps: true },
);

export const CampaignModel = model('Campaign', campaignSchema, 'campaign');
