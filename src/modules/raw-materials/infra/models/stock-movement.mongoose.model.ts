import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const stockMovementSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    rawMaterialId: { type: String },
    productId: { type: String },
    type: { type: String, enum: ['entrada', 'saida', 'ajuste'], required: true },
    quantity: { type: Number, required: true },
    reason: { type: String },
    purchaseOrderId: { type: String },
    createdBy: { type: String },
  },
  { _id: false, timestamps: true },
);

// docs/architecture/patterns.md §16.6.1 — índice composto liderando por restaurantId; histórico
// por matéria-prima (REQ-6) é a segunda query mais comum deste módulo.
stockMovementSchema.index({ restaurantId: 1, rawMaterialId: 1, createdAt: 1 });

export const StockMovementModel = model('StockMovement', stockMovementSchema, 'stockMovement');
