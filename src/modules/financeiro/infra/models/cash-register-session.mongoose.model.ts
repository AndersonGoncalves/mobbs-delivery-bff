import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const cashRegisterSessionSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    businessDate: { type: String },
    accountingEndAt: { type: Date },
    movementVersion: { type: Number, default: 0 },
    movementWrites: { type: Number, default: 0 },
    openedAt: { type: Date, required: true, default: () => new Date() },
    closedAt: { type: Date },
    openingBalance: { type: Number, required: true },
    closingBalance: { type: Number },
    status: { type: String, enum: ['aberto', 'fechado'], required: true, default: 'aberto' },
    openedBy: { type: String },
    closedBy: { type: String },
    // specs/0118-controle-caixa-automatico-redes-sociais REQ-3/REQ-4/REQ-5.
    openedAutomatically: { type: Boolean },
    closedAutomatically: { type: Boolean },
  },
  { _id: false, timestamps: false },
);

// REQ-8 — resolver rapidamente "há sessão aberta pra este restaurante?" é a query mais frequente
// do módulo (toda tela de caixa abre consultando isso).
cashRegisterSessionSchema.index({ restaurantId: 1, status: 1 });
cashRegisterSessionSchema.index(
  { restaurantId: 1, businessDate: 1 },
  { unique: true, partialFilterExpression: { businessDate: { $type: 'string' } } },
);

export const CashRegisterSessionModel = model('CashRegisterSession', cashRegisterSessionSchema, 'cashRegisterSession');
