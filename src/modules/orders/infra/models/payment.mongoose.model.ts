import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const paymentSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    orderId: { type: String, required: true },
    method: { type: String, enum: ['creditCard', 'debitCard', 'pix', 'cash', 'bankTransfer'], required: true },
    cardBrand: { type: String },
    status: { type: String, enum: ['pendente', 'aprovado', 'recusado', 'estornado'], required: true, default: 'pendente' },
    amount: { type: Number, required: true },
    externalReference: { type: String },
  },
  { _id: false, timestamps: true },
);

paymentSchema.index({ orderId: 1 });

export const PaymentModel = model('Payment', paymentSchema, 'payment');
