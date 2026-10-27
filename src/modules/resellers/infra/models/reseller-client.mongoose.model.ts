import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const resellerClientSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    resellerId: { type: String, required: true },
    // plan.md decisão 3 — um restaurante só pode ter um revendedor; índice único como defesa em
    // profundidade (a checagem real/a mensagem de erro clara é feita no controller, antes de
    // chamar `create`).
    restaurantId: { type: String, required: true, unique: true },
    origin: { type: String, enum: ['link', 'manual'], required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: false },
);

resellerClientSchema.index({ resellerId: 1 });

export const ResellerClientModel = model('ResellerClient', resellerClientSchema, 'reseller_clients');
