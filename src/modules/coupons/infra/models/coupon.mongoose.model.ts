import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const couponSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    code: { type: String, required: true },
    discountType: { type: String, enum: ['percentual', 'fixo'], required: true },
    discountValue: { type: Number, required: true },
    minOrderValue: { type: Number },
    validFrom: { type: Date, required: true },
    validUntil: { type: Date },
    usageLimit: { type: Number },
    usageLimitPerCustomer: { type: Number },
    usageCount: { type: Number, required: true, default: 0 },
    isActive: { type: Boolean, required: true, default: true },
  },
  { _id: false, timestamps: true },
);

// REQ-1 — código único **por restaurante** (não globalmente, "Fora de escopo": nada de cupom
// multi-restaurante/plataforma).
couponSchema.index({ restaurantId: 1, code: 1 }, { unique: true });

export const CouponModel = model('Coupon', couponSchema, 'coupon');
