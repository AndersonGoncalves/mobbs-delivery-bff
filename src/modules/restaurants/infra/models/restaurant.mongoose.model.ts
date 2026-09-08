import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const businessHoursSchema = new Schema(
  {
    dayOfWeek: {
      type: String,
      required: true,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    },
    isClosed: { type: Boolean, required: true },
    openTime: { type: String },
    closeTime: { type: String },
  },
  { _id: false },
);

const restaurantSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    isActive: { type: Boolean, required: true, default: true },
    logoUrl: { type: String },
    primaryColor: { type: String },
    businessHours: { type: [businessHoursSchema], default: [] },
  },
  { _id: false, timestamps: true },
);

restaurantSchema.index({ slug: 1 }, { unique: true });

// Nome da coleção explícito (singular, camelCase, docs/architecture/patterns.md §16.6.1) — sem o
// terceiro argumento, o Mongoose pluralizaria sozinho para "restaurants", quebrando a convenção
// (achado rodando o BFF de verdade contra um Mongo real: a busca por slug sempre voltava 404,
// porque estava sendo escrita/lida em coleções com nomes diferentes).
export const RestaurantModel = model('Restaurant', restaurantSchema, 'restaurant');
