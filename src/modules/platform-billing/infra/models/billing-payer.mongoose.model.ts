import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const billingPayerAddressSchema = new Schema(
  {
    street: { type: String, required: true },
    number: { type: String, required: true },
    complement: { type: String },
    neighborhood: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
  },
  { _id: false },
);

const billingPayerSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    asaasCustomerId: { type: String, required: true },
    legalName: { type: String, required: true },
    document: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: billingPayerAddressSchema, required: true },
    completedAt: { type: Date },
  },
  { _id: false, timestamps: true },
);

// Um pagador por restaurante — `save()` do repositório é sempre upsert por este campo.
billingPayerSchema.index({ restaurantId: 1 }, { unique: true });

export const BillingPayerModel = model('BillingPayer', billingPayerSchema, 'billingPayer');
