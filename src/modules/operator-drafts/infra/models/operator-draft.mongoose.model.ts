import { Schema, model } from 'mongoose';

const operatorDraftSchema = new Schema({
  restaurantId: { type: String, required: true },
  operatorId: { type: String, required: true },
  slot: { type: Number, required: true, enum: [1, 2] },
  revision: { type: Number, required: true, default: 0 },
  modality: { type: String, required: true, default: 'delivery' },
  customerId: { type: String },
  customerName: { type: String },
  customerPhone: { type: String },
  deliveryAddress: { type: String },
  deliveryNeighborhood: { type: String },
  items: { type: [Schema.Types.Mixed], default: [] },
  notes: { type: String },
  couponCode: { type: String },
  adjustment: { type: Schema.Types.Mixed },
  paymentMethod: { type: String },
  cashChangeFor: { type: Number },
  status: { type: String, required: true, default: 'draft', enum: ['draft', 'finalizing', 'finalized'] },
  orderId: { type: String },
  finalizedClientRequestId: { type: String },
  lastEditedFrom: { type: String },
  updatedAt: { type: Date, required: true, default: Date.now },
});

// specs/0174-pdv-extensao-chrome-lateral REQ-8 — um único rascunho por operador+restaurante+slot;
// é também o filtro usado por todas as escritas otimistas (`save`/`clear`/`tryClaimForFinalize`).
operatorDraftSchema.index({ restaurantId: 1, operatorId: 1, slot: 1 }, { unique: true });

export const OperatorDraftModel = model('OperatorDraft', operatorDraftSchema, 'operator_drafts');
