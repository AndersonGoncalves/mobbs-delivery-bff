import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const promotionSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    name: { type: String, required: true },
    discountPercentage: { type: Number, required: true },
    productIds: { type: [String], required: true, default: [] },
    isActive: { type: Boolean, required: true, default: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
  },
  { _id: false, timestamps: true },
);

promotionSchema.index({ restaurantId: 1, isActive: 1 });

export const PromotionModel = model('Promotion', promotionSchema, 'promotion');
