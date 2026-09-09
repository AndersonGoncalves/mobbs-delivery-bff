import { Schema, model } from 'mongoose';

/**
 * specs/0005-checkout — `Order.orderNumber` é sequencial **por restaurante** (reinicia por
 * tenant, `docs/architecture/data-model.md`). Coleção auxiliar dedicada (`_id` = `restaurantId`,
 * `seq` incrementado atomicamente via `findOneAndUpdate($inc)`, `upsert: true`) — evita duas
 * requisições concorrentes gerarem o mesmo número (o que um "pega o último Order e soma 1"
 * simples não garante).
 */
const orderCounterSchema = new Schema(
  {
    _id: { type: String },
    seq: { type: Number, required: true, default: 0 },
  },
  { _id: false, versionKey: false },
);

export const OrderCounterModel = model('OrderCounter', orderCounterSchema, 'order_counter');
