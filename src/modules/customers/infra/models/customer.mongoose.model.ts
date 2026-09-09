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
    deletedAt: { type: Date },
  },
  { _id: false, timestamps: true },
);

export const CustomerModel = model('Customer', customerSchema, 'customer');
