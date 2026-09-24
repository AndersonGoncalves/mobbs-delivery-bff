import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const menuCategorySchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    name: { type: String, required: true },
    sortOrder: { type: Number, required: true },
    // specs/0061-categoria-ativa-inativa.
    isActive: { type: Boolean, required: true, default: true },
  },
  { _id: false, timestamps: true },
);

menuCategorySchema.index({ restaurantId: 1, sortOrder: 1 });

export const MenuCategoryModel = model('MenuCategory', menuCategorySchema, 'menuCategory');
