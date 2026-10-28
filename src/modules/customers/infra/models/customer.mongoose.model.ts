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

export const CustomerModel = model('Customer', customerSchema, 'customer');
