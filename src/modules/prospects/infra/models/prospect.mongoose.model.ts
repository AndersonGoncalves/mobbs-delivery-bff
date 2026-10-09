import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const prospectSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    placeId: { type: String, required: true },
    establishmentName: { type: String, required: true },
    category: { type: String, required: true },
    phone: { type: String },
    address: { type: String },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    rating: { type: Number },
    contactName: { type: String },
    // specs/0124-campanha-whatsapp-prospects REQ-4/REQ-7.
    lastContactedAt: { type: Date },
  },
  { _id: false, timestamps: true },
);

// REQ-9 — `placeId` único: índice garante a deduplicação mesmo sob concorrência, não só a
// checagem de aplicação em `ProspectsController` (mesmo raciocínio de outros índices do BFF).
prospectSchema.index({ placeId: 1 }, { unique: true });
prospectSchema.index({ category: 1, createdAt: -1 });

export const ProspectModel = model('Prospect', prospectSchema, 'prospect');
