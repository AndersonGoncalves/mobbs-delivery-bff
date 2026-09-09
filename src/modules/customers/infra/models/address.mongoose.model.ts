import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const addressSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    customerId: { type: String, required: true },
    label: { type: String, required: true },
    street: { type: String, required: true },
    number: { type: String, required: true },
    complement: { type: String },
    neighborhood: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    isDefault: { type: Boolean, required: true, default: false },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);

addressSchema.index({ customerId: 1 });

export const AddressModel = model('Address', addressSchema, 'address');
