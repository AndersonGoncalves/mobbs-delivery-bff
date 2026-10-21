import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const paymentSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    orderId: { type: String, required: true },
    method: { type: String, enum: ['creditCard', 'creditCardOnline', 'debitCard', 'pix', 'cash'], required: true },
    cardBrand: { type: String },
    status: { type: String, enum: ['pendente', 'aprovado', 'recusado', 'estornado'], required: true, default: 'pendente' },
    amount: { type: Number, required: true },
    externalReference: { type: String },
    // specs/0101-integracao-asaas (fase 1).
    pixPayload: { type: String },
    // specs/0170-integracao-mercado-pago.
    checkoutUrl: { type: String },
  },
  { _id: false, timestamps: true },
);

paymentSchema.index({ orderId: 1 });

export const PaymentModel = model('Payment', paymentSchema, 'payment');
