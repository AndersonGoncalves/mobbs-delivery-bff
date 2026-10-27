import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const customerBalanceSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    customerId: { type: String, required: true },
    restaurantId: { type: String, required: true },
    balance: { type: Number, required: true, default: 0 },
    loyaltyStampCount: { type: Number, required: true, default: 0 },
  },
  { _id: false, timestamps: { createdAt: false, updatedAt: true } },
);

// Um documento por par (isolamento multi-tenant — nunca somado/transferido entre restaurantes).
customerBalanceSchema.index({ customerId: 1, restaurantId: 1 }, { unique: true });

export const CustomerBalanceModel = model('CustomerBalance', customerBalanceSchema, 'customer_balance');
