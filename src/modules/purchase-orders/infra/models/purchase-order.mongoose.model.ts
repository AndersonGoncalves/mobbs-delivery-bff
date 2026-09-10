import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const purchaseOrderItemSchema = new Schema(
  {
    rawMaterialId: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitCost: { type: Number, required: true },
  },
  { _id: false },
);

const purchaseOrderSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    supplierId: { type: String, required: true },
    status: { type: String, enum: ['aberto', 'recebido', 'cancelado'], required: true, default: 'aberto' },
    items: { type: [purchaseOrderItemSchema], required: true },
    totalValue: { type: Number, required: true },
    receivedAt: { type: Date },
  },
  { _id: false, timestamps: true },
);

// docs/architecture/patterns.md §16.6.1 — índice composto liderando por restaurantId; listagem
// ordena por criação (mais recente primeiro).
purchaseOrderSchema.index({ restaurantId: 1, createdAt: -1 });

export const PurchaseOrderModel = model('PurchaseOrder', purchaseOrderSchema, 'purchaseOrder');
