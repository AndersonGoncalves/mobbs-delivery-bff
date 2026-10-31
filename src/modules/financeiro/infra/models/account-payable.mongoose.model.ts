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

// Achado de performance da auditoria pré-produção (31/10/2026) — `buildAccountListQuery`
// (`listByRestaurant`) passou a filtrar por `status` no ramo `'aberto'` do `$or` default; sem
// isso, esse ramo faria o Mongo varrer TODOS os vencimentos do restaurante filtrando status em
// memória, mesmo problema que o índice acima já resolve pro ramo de `dueDate`.
accountPayableSchema.index({ restaurantId: 1, status: 1 });

export const AccountPayableModel = model('AccountPayable', accountPayableSchema, 'accountPayable');
