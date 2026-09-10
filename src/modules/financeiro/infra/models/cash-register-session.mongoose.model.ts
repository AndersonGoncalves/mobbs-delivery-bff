import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const cashRegisterSessionSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    openedAt: { type: Date, required: true, default: () => new Date() },
    closedAt: { type: Date },
    openingBalance: { type: Number, required: true },
    closingBalance: { type: Number },
    status: { type: String, enum: ['aberto', 'fechado'], required: true, default: 'aberto' },
    openedBy: { type: String },
    closedBy: { type: String },
  },
  { _id: false, timestamps: false },
);

// REQ-8 — resolver rapidamente "há sessão aberta pra este restaurante?" é a query mais frequente
// do módulo (toda tela de caixa abre consultando isso).
cashRegisterSessionSchema.index({ restaurantId: 1, status: 1 });

export const CashRegisterSessionModel = model('CashRegisterSession', cashRegisterSessionSchema, 'cashRegisterSession');
