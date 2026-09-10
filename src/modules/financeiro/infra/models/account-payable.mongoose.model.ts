import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const accountPayableSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    description: { type: String, required: true },
    supplierId: { type: String },
    issueDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    value: { type: Number, required: true },
    status: { type: String, enum: ['aberto', 'pago', 'cancelado'], required: true, default: 'aberto' },
    paidAt: { type: Date },
    paidValue: { type: Number },
  },
  { _id: false, timestamps: true },
);

// docs/architecture/patterns.md §16.6.1 — toda coleção com `restaurantId` ganha índice composto
// liderando por ele; listagem também ordena por vencimento com mais frequência que por criação.
accountPayableSchema.index({ restaurantId: 1, dueDate: 1 });

export const AccountPayableModel = model('AccountPayable', accountPayableSchema, 'accountPayable');
