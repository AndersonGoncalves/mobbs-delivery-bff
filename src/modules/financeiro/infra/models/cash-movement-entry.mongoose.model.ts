import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const cashMovementEntrySchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    cashRegisterSessionId: { type: String, required: true },
    type: { type: String, enum: ['entrada', 'saida'], required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    orderId: { type: String },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);

cashMovementEntrySchema.index({ cashRegisterSessionId: 1, createdAt: 1 });

export const CashMovementEntryModel = model('CashMovementEntry', cashMovementEntrySchema, 'cashMovementEntry');
