import { Schema, model } from 'mongoose';

const customerPixKeySchema = new Schema(
  {
    _id: { type: String, required: true },
    type: { type: String, enum: ['cpf', 'phone', 'email', 'random'], required: true },
    encryptedValue: { type: String, required: true },
    termsVersionAccepted: { type: String, required: true },
    acceptedAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { _id: false },
);

export const CustomerPixKeyModel = model('CustomerPixKey', customerPixKeySchema, 'customer_pix_keys');
