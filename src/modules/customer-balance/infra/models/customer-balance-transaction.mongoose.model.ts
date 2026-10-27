import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const customerBalanceTransactionSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    customerId: { type: String, required: true },
    restaurantId: { type: String, required: true },
    source: { type: String, enum: ['cashback_credit', 'loyalty_reward_credit', 'redemption_debit', 'redemption_refund'], required: true },
    amount: { type: Number, required: true },
    orderId: { type: String },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);

// REQ-8 (0131)/REQ-6 (0132) — histórico por cliente+restaurante, mais recente primeiro.
customerBalanceTransactionSchema.index({ customerId: 1, restaurantId: 1, createdAt: -1 });

export const CustomerBalanceTransactionModel = model('CustomerBalanceTransaction', customerBalanceTransactionSchema, 'customer_balance_transaction');
