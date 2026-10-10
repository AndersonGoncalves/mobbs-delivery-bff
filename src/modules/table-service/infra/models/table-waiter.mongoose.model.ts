import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const tableWaiterSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    name: { type: String, required: true },
    isActive: { type: Boolean, required: true, default: true },
  },
  { _id: false, timestamps: true },
);

tableWaiterSchema.index({ restaurantId: 1, name: 1 });

export const TableWaiterModel = model('TableWaiter', tableWaiterSchema, 'tablewaiter');