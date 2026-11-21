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
    // Ajuste explícito do usuário (02/11/2026) — auditoria de reabertura (só dono).
    reopenedBy: { type: String },
    reopenedAt: { type: Date },
  },
  { _id: false, timestamps: false },
);

// REQ-8 — resolver rapidamente "há sessão aberta pra este restaurante?" é a query mais frequente
// do módulo (toda tela de caixa abre consultando isso).
cashRegisterSessionSchema.index({ restaurantId: 1, status: 1 });
// specs/0219-multiplas-sessoes-caixa-por-dia — índice de apoio pra consultas por `businessDate`
// (sessões fechadas de um dia, combobox "Caixa para conferência"); deixou de ser único: um dia
// pode ter mais de uma sessão (turnos/troca de operador), uma depois da outra.
cashRegisterSessionSchema.index({ restaurantId: 1, businessDate: 1 });
// A invariante real do sistema nunca foi "1 sessão por dia" — é "nunca mais de uma sessão ABERTA
// ao mesmo tempo pro mesmo restaurante" (já garantida na aplicação por `findPendingSessions`
// antes de `open()`). Este índice único parcial garante a mesma coisa no banco.
cashRegisterSessionSchema.index(
  { restaurantId: 1 },
  { unique: true, partialFilterExpression: { status: 'aberto' } },
);

export const CashRegisterSessionModel = model('CashRegisterSession', cashRegisterSessionSchema, 'cashRegisterSession');
