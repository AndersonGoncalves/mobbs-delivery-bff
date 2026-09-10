import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const restaurantOperatorSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    email: { type: String, required: true },
    // specs/0021-papeis-operador REQ-1/REQ-7 — `required: true` só é seguro porque
    // `migrateOperatorRolesToDono` (infra/migrations/) roda no bootstrap do servidor, antes de
    // qualquer rota aceitar tráfego, preenchendo `role` em todo documento pré-existente sem o
    // campo (plan.md, "Riscos": ordem importa — migração primeiro, depois `required: true`).
    role: { type: String, enum: ['dono', 'gerente', 'financeiro'], required: true, default: 'dono' },
    isActive: { type: Boolean, required: true, default: true },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);

restaurantOperatorSchema.index({ restaurantId: 1, email: 1 }, { unique: true });

// Nome de coleção explícito (singular, docs/architecture/patterns.md §16.6.1) — mesma convenção
// de RestaurantModel, evita a pluralização automática do Mongoose.
export const RestaurantOperatorModel = model(
  'RestaurantOperator',
  restaurantOperatorSchema,
  'restaurantOperator',
);
