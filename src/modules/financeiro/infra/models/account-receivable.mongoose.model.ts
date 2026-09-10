import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const accountReceivableSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    description: { type: String, required: true },
    customerId: { type: String },
    issueDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    value: { type: Number, required: true },
    status: { type: String, enum: ['aberto', 'pago', 'cancelado'], required: true, default: 'aberto' },
    receivedAt: { type: Date },
    receivedValue: { type: Number },
  },
  { _id: false, timestamps: true },
);

accountReceivableSchema.index({ restaurantId: 1, dueDate: 1 });

export const AccountReceivableModel = model('AccountReceivable', accountReceivableSchema, 'accountReceivable');
