import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

// Recursivo (produto composto, mesmo motivo de `productAdditionalGroupSchema` em
// catalog/infra/models/product.mongoose.model.ts) — `nestedSelections` referencia o próprio
// schema, por isso é declarado com `.add()` depois.
const orderItemSelectionSchema = new Schema(
  {
    groupName: { type: String, required: true },
    optionName: { type: String, required: true },
    priceDelta: { type: Number, required: true },
  },
  { _id: false },
);

orderItemSelectionSchema.add({
  nestedSelections: { type: [orderItemSelectionSchema], default: [] },
});

const orderItemSchema = new Schema(
  {
    id: { type: String, required: true },
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true },
    selections: { type: [orderItemSelectionSchema], default: [] },
    unitPrice: { type: Number, required: true },
    notes: { type: String },
  },
  { _id: false },
);

const orderStatusHistorySchema = new Schema(
  {
    status: { type: String, required: true },
    changedAt: { type: Date, required: true },
    changedBy: { type: String },
    reason: { type: String },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    orderNumber: { type: Number, required: true },
    trackingToken: { type: String, required: true, unique: true },
    customerId: { type: String, required: true },
    restaurantId: { type: String, required: true },
    items: { type: [orderItemSchema], default: [] },
    orderType: { type: String, enum: ['delivery', 'pickup'], required: true },
    deliveryAddress: { type: String },
    notes: { type: String },
    status: {
      type: String,
      enum: ['aguardandoConfirmacao', 'confirmado', 'emPreparo', 'saiuParaEntrega', 'entregue', 'cancelado'],
      required: true,
      default: 'aguardandoConfirmacao',
    },
    statusHistory: { type: [orderStatusHistorySchema], default: [] },
    subtotal: { type: Number, required: true },
    deliveryFee: { type: Number, required: true },
    discount: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true },
    // specs/0022-cupons-desconto REQ-2/REQ-4 — código do cupom aplicado, se algum (ver `IOrder.couponCode`).
    couponCode: { type: String },
    paymentMethod: { type: String, enum: ['creditCard', 'debitCard', 'pix', 'cash', 'bankTransfer'], required: true },
    estimatedDeliveryAt: { type: Date },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);

orderSchema.index({ restaurantId: 1, orderNumber: 1 });
orderSchema.index({ customerId: 1 });
// specs/0022-cupons-desconto REQ-6 — suporta `countByCustomerAndCoupon` (limite de uso por cliente).
orderSchema.index({ restaurantId: 1, customerId: 1, couponCode: 1 });

export const OrderModel = model('Order', orderSchema, 'order');
