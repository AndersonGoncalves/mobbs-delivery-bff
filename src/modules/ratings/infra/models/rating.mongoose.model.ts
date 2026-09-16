import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const ratingSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    customerId: { type: String, required: true },
    score: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String },
  },
  { _id: false, timestamps: true },
);

// Um rating por cliente por restaurante — upsert() usa exatamente este par como filtro.
ratingSchema.index({ restaurantId: 1, customerId: 1 }, { unique: true });
ratingSchema.index({ restaurantId: 1, updatedAt: -1 });

export const RatingModel = model('Rating', ratingSchema, 'rating');
