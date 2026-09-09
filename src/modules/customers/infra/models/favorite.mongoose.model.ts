import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const favoriteSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    customerId: { type: String, required: true },
    restaurantId: { type: String, required: true },
    productId: { type: String, required: true },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);

// Um cliente só pode favoritar o mesmo produto uma vez — garante idempotência de `add()` mesmo
// sob race (double-tap) sem depender de um `findOne` prévio.
favoriteSchema.index({ customerId: 1, productId: 1 }, { unique: true });
favoriteSchema.index({ customerId: 1, restaurantId: 1 });

export const FavoriteModel = model('Favorite', favoriteSchema, 'favorite');
