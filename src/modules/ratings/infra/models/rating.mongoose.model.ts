import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

// specs/0078-resposta-restaurante-avaliacoes REQ-1 — `_id: false` (sem PK própria, é um campo
// embutido 1:1 com o rating, mesmo raciocínio de outros subdocumentos deste projeto).
const ratingReplySchema = new Schema(
  {
    text: { type: String, required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false },
);

const ratingSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    customerId: { type: String, required: true },
    score: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String },
    reply: { type: ratingReplySchema },
  },
  { _id: false, timestamps: true },
);

// Um rating por cliente por restaurante — upsert() usa exatamente este par como filtro.
ratingSchema.index({ restaurantId: 1, customerId: 1 }, { unique: true });
ratingSchema.index({ restaurantId: 1, updatedAt: -1 });

export const RatingModel = model('Rating', ratingSchema, 'rating');
