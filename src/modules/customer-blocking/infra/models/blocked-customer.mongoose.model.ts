import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const blockedCustomerSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    phone: { type: String, required: true },
    customerName: { type: String },
  },
  { _id: false, timestamps: true },
);

// Um telefone só pode estar bloqueado uma vez por restaurante (evita duplicata no `block()`
// upsert e permite achar rápido na checagem do checkout, `isBlocked`).
blockedCustomerSchema.index({ restaurantId: 1, phone: 1 }, { unique: true });

export const BlockedCustomerModel = model('BlockedCustomer', blockedCustomerSchema, 'blockedcustomer');
