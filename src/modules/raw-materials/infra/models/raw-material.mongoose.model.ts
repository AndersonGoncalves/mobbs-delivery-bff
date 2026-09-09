import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const rawMaterialSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    name: { type: String, required: true },
    priceDelta: { type: Number, required: true },
    isActive: { type: Boolean, required: true, default: true },
  },
  { _id: false, timestamps: true },
);

rawMaterialSchema.index({ restaurantId: 1 });

export const RawMaterialModel = model('RawMaterial', rawMaterialSchema, 'rawMaterial');
