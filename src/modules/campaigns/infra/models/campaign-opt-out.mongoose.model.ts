import { randomBytes, randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const campaignOptOutSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    customerId: { type: String, required: true },
    // specs/0092 — token opaco, url-safe; `base64url` fica mais curto que hex pro mesmo número de bytes.
    token: { type: String, required: true, default: () => randomBytes(16).toString('base64url') },
    optedOutAt: { type: Date },
  },
  { _id: false, timestamps: true },
);

// REQ-5 — um registro por cliente+restaurante (token reaproveitado entre campanhas, ver plan.md ADR).
campaignOptOutSchema.index({ restaurantId: 1, customerId: 1 }, { unique: true });
campaignOptOutSchema.index({ token: 1 }, { unique: true });

export const CampaignOptOutModel = model('CampaignOptOut', campaignOptOutSchema, 'campaignoptout');
