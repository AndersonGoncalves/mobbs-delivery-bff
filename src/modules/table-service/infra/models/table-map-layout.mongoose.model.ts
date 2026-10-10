import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const decorationSchema = new Schema(
  {
    id: { type: String, required: true, default: () => randomUUID() },
    label: { type: String, required: true },
    type: { type: String, enum: ['wall', 'bar', 'kitchen', 'entrance', 'other'], required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true, min: 24 },
    height: { type: Number, required: true, min: 24 },
  },
  { _id: false },
);

const tableMapLayoutSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true, unique: true },
    decorations: { type: [decorationSchema], default: [] },
    spendingLimit: { type: Number, min: 0.01 },
  },
  { _id: false, timestamps: true },
);

export const TableMapLayoutModel = model('TableMapLayout', tableMapLayoutSchema, 'tablemaplayout');