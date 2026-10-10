import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const positionSchema = new Schema(
  {
    x: { type: Number, required: true, default: 24 },
    y: { type: Number, required: true, default: 24 },
    width: { type: Number, required: true, default: 150, min: 80 },
    height: { type: Number, required: true, default: 100, min: 60 },
  },
  { _id: false },
);

const restaurantTableSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    name: { type: String, required: true },
    normalizedName: { type: String, required: true },
    capacity: { type: Number, min: 1 },
    position: { type: positionSchema, required: true, default: () => ({}) },
    activeOrderId: { type: String },
  },
  { _id: false, timestamps: true },
);

restaurantTableSchema.index({ restaurantId: 1, normalizedName: 1 }, { unique: true });
restaurantTableSchema.index({ restaurantId: 1, activeOrderId: 1 });

export const RestaurantTableModel = model('RestaurantTable', restaurantTableSchema, 'restauranttable');