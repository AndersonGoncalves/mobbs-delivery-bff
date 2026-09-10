import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const rawMaterialSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    name: { type: String, required: true },
    priceDelta: { type: Number, required: true },
    isActive: { type: Boolean, required: true, default: true },
    // specs/0015-estoque-compras — texto livre nesta v1 (decisão confirmada, spec.md).
    unit: { type: String, required: true },
    currentStock: { type: Number, required: true, default: 0 },
    minimumStockAlert: { type: Number },
  },
  { _id: false, timestamps: true },
);

rawMaterialSchema.index({ restaurantId: 1 });

export const RawMaterialModel = model('RawMaterial', rawMaterialSchema, 'rawMaterial');
