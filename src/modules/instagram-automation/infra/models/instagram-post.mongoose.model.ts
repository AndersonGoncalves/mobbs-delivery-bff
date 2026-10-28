import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const instagramPostSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true, index: true },
    imageUrl: { type: String, required: true },
    caption: { type: String, required: true },
    scheduledAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ['agendado', 'publicado', 'falhou'], required: true, default: 'agendado' },
    publishedAt: { type: Date },
    errorMessage: { type: String },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

export const InstagramPostModel = model('InstagramPost', instagramPostSchema, 'instagram_posts');
