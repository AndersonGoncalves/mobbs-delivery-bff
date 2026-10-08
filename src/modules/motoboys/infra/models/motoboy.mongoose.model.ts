import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const motoboySchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    name: { type: String, required: true },
    whatsapp: { type: String, required: true },
    canMarkAsDelivered: { type: Boolean, required: true, default: true },
    isActive: { type: Boolean, required: true, default: true },
  },
  { _id: false, timestamps: true },
);

motoboySchema.index({ restaurantId: 1 });

export const MotoboyModel = model('Motoboy', motoboySchema, 'motoboy');
