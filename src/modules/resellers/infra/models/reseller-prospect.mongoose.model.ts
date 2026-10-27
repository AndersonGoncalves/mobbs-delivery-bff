import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const resellerProspectSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    resellerId: { type: String, required: true },
    establishmentName: { type: String, required: true },
    phone: { type: String },
    address: { type: String },
    notes: { type: String },
    status: { type: String, enum: ['em_prospeccao', 'convertido'], default: 'em_prospeccao' },
    convertedRestaurantId: { type: String },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

resellerProspectSchema.index({ resellerId: 1 });

export const ResellerProspectModel = model('ResellerProspect', resellerProspectSchema, 'reseller_prospects');
