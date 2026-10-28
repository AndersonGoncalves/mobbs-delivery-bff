import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const resellerSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: () => new Date() },
    pixKey: { type: String, required: false },
  },
  { _id: false },
);

export const ResellerModel = model('Reseller', resellerSchema, 'resellers');
