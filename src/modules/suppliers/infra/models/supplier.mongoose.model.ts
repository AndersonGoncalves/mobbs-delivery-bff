import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const supplierSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    name: { type: String, required: true },
    document: { type: String },
    phone: { type: String },
    email: { type: String },
    address: {
      type: new Schema({
        zipCode: String,
        street: String,
        number: String,
        complement: String,
        neighborhood: String,
        city: String,
        state: String,
      }, { _id: false }),
      required: false,
    },
    isActive: { type: Boolean, required: true, default: true },
  },
  { _id: false, timestamps: true },
);

supplierSchema.index({ restaurantId: 1 });

export const SupplierModel = model('Supplier', supplierSchema, 'supplier');
