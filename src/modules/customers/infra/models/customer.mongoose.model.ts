import { Schema, model } from 'mongoose';

// `_id` é o UID do Firebase Auth (nunca gerado aqui, diferente de Restaurant/Order) — mesmo
// documento em todo login futuro com a mesma conta Google.
const customerSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    photoUrl: { type: String },
    phone: { type: String },
    document: { type: String },
    termsAcceptedAt: { type: Date },
    termsVersionAccepted: { type: String },
    // specs/0171-meios-pagamento-por-cliente REQ-1 — ausente/`null` = sem restrição própria.
    allowedPaymentMethods: { type: [String] },
    deletedAt: { type: Date },
    // (achado real, pedido explícito do usuário) — cliente cadastrado manualmente pela retaguarda
    // (botão "NOVO" em Clientes), sem pedido nenhum ainda — só esse restaurante pode vê-lo na
    // lista (ver `CustomerSummaryMongooseRepository`), nunca outro.
    createdByRestaurantId: { type: String },
  },
  { _id: false, timestamps: true },
);

// Achado de auditoria (31/10/2026) — coleção cresce com o total de clientes de TODOS os
// restaurantes (não por tenant); sem índice, `findByPhone`/`createByRestaurant` (busca por
// `phone`, chamada a cada busca de cliente/cadastro rápido no PDV) era full scan da base inteira
// da plataforma. `sparse: true` — a maioria dos clientes do app não preenche telefone.
customerSchema.index({ phone: 1 }, { sparse: true });

export const CustomerModel = model('Customer', customerSchema, 'customer');
