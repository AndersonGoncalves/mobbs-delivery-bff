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
    // specs/0047-ajustes-diversos-onboarding-estoque-pagamento REQ-16 — resolvido pelo BFF, nunca
    // aceito do cliente (ver comentário na entity).
    linkedProductId: { type: String },
    rawMaterialId: { type: String },
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
    stockReservations: {
      type: [{
        resourceType: { type: String, enum: ['product', 'rawMaterial'], required: true },
        resourceId: { type: String, required: true },
        unitsPerItem: { type: Number, required: true, min: 0.01 },
        quantity: { type: Number, required: true, min: 0.01 },
        operationId: { type: String, required: true },
      }],
      default: [],
    },
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

const tableAdjustmentSchema = new Schema(
  {
    type: { type: String, enum: ['discount', 'surcharge'], required: true },
    mode: { type: String, enum: ['fixed', 'percent'], required: true },
    value: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const tableOrderPaymentSchema = new Schema(
  {
    id: { type: String, required: true },
    method: { type: String, enum: ['creditCard', 'debitCard', 'pix', 'cash'], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    paidAt: { type: String, required: true },
    paidBy: { type: String, required: true },
  },
  { _id: false },
);

const deliveryMotoboySchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
  },
  { _id: false },
);

const tableWaiterSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
  },
  { _id: false },
);

// specs/0091-integracao-fiscal-focusnfe (ver IOrderFiscal).
const orderFiscalSchema = new Schema(
  {
    status: { type: String, enum: ['pendente', 'emitido', 'rejeitado', 'cancelado'], required: true },
    ref: { type: String },
    documentUrl: { type: String },
    rejectedReason: { type: String },
  },
  { _id: false },
);

// specs/0121-integracao-uber-entregas (ver IOrderUberDelivery).
const orderUberDeliverySchema = new Schema(
  {
    status: { type: String, enum: ['solicitado', 'aceito', 'a_caminho', 'entregue', 'cancelado'], required: true },
    deliveryId: { type: String },
    quoteId: { type: String },
    trackingUrl: { type: String },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    orderNumber: { type: Number, required: true },
    trackingToken: { type: String, required: true, unique: true },
    idempotencyKey: { type: String },
    customerId: { type: String, required: true },
    restaurantId: { type: String, required: true },
    items: { type: [orderItemSchema], default: [] },
    orderType: { type: String, enum: ['delivery', 'pickup', 'table'], required: true },
    // specs/0155-app-totem-autoatendimento REQ-14 — ausente = pedido do app cliente (default de
    // todo documento já existente antes desta spec).
    source: { type: String, enum: ['totem', 'operador-web', 'operador-extensao', 'ifood', 'comanda'] },
    // specs/0174-pdv-extensao-chrome-lateral REQ-22.
    operatorId: { type: String },
    deliveryAddress: { type: String },
    deliveryMotoboy: { type: deliveryMotoboySchema, default: undefined },
    tableId: { type: String },
    tableName: { type: String },
    tableWaiter: { type: tableWaiterSchema, default: undefined },
    serviceChargePercent: { type: Number, min: 0, max: 100 },
    serviceChargeAmount: { type: Number, min: 0 },
    coverCharge: { type: Number, min: 0 },
    tableAdjustment: { type: tableAdjustmentSchema },
    tablePeopleCount: { type: Number, min: 1 },
    tablePayments: { type: [tableOrderPaymentSchema], default: [] },
    tableClosedAt: { type: String },
    tableMergedIntoOrderId: { type: String },
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
    // specs/0131-cashback-app REQ-4/REQ-5 (ver `IOrder.cashbackUsed`).
    cashbackUsed: { type: Number },
    paymentMethod: { type: String, enum: ['creditCard', 'creditCardOnline', 'debitCard', 'pix', 'cash'], required: true },
    // specs/0080-troco-pagamento-dinheiro-checkout REQ-2 (ver `IOrder.cashChangeFor`).
    cashChangeFor: { type: Number },
    estimatedDeliveryAt: { type: Date },
    // specs/0139-impressao-automatica-bridge REQ-3.
    autoPrintStatus: { type: String, enum: ['printed'] },
    // specs/0091-integracao-fiscal-focusnfe — ausente = sem integração fiscal/ainda não emitido.
    fiscal: { type: orderFiscalSchema, default: undefined },
    // specs/0121-integracao-uber-entregas — ausente = sem entrega via Uber Direct.
    uberDelivery: { type: orderUberDeliverySchema, default: undefined },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);

orderSchema.index({ restaurantId: 1, orderNumber: 1 });
orderSchema.index(
  { restaurantId: 1, customerId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);
orderSchema.index({ customerId: 1 });
// specs/0022-cupons-desconto REQ-6 — suporta `countByCustomerAndCoupon` (limite de uso por cliente).
orderSchema.index({ restaurantId: 1, customerId: 1, couponCode: 1 });

export const OrderModel = model('Order', orderSchema, 'order');
