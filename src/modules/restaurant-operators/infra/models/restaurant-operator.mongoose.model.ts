import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const restaurantOperatorSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    email: { type: String, required: true },
    // Opcional para manter compatibilidade com operadores históricos; novos cadastros exigem nome.
    name: { type: String },
    whatsapp: { type: String },
    photoUrl: { type: String },
    // specs/0021-papeis-operador REQ-1/REQ-7 — `required: true` só é seguro porque
    // `migrateOperatorRolesToDono` (infra/migrations/) roda no bootstrap do servidor, antes de
    // qualquer rota aceitar tráfego, preenchendo `role` em todo documento pré-existente sem o
    // campo (plan.md, "Riscos": ordem importa — migração primeiro, depois `required: true`).
    //
    // Achado real (pedido explícito do usuário) — o enum nunca foi atualizado quando
    // specs/0137-papeis-garcom-motoboy acrescentou os papéis `garcom`/`motoboy`: a validação Zod
    // da rota (`operatorRoleSchema`) já aceitava os dois, mas o Mongoose rejeitava o `.create()`
    // na hora de salvar (erro não tratado, sem try/catch na rota) — cadastrar um operador
    // garçom/motoboy sempre falhava, mesmo com o restante do sistema já pronto pra eles.
    role: { type: String, enum: ['dono', 'gerente', 'financeiro', 'garcom', 'motoboy'], required: true, default: 'dono' },
    hasFullAccess: { type: Boolean, required: true, default: false },
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
