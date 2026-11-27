import { IPayment, PaymentMethod, PaymentProvider, PaymentStatus } from '../../domain/entities/order.entity';
import { IPaymentRepository } from '../../domain/repositories/payment.repository.interface';
import { OrderModel } from '../models/order.mongoose.model';
import { PaymentModel } from '../models/payment.mongoose.model';

interface PaymentLeanDocument {
  _id: string;
  orderId: string;
  method: PaymentMethod;
  cardBrand?: string;
  status: PaymentStatus;
  amount: number;
  externalReference?: string;
  pixPayload?: string;
  checkoutUrl?: string;
  provider?: PaymentProvider;
}

function toEntity(doc: PaymentLeanDocument): IPayment {
  return {
    id: doc._id,
    orderId: doc.orderId,
    method: doc.method,
    cardBrand: doc.cardBrand,
    status: doc.status,
    amount: doc.amount,
    externalReference: doc.externalReference,
    pixPayload: doc.pixPayload,
    checkoutUrl: doc.checkoutUrl,
    provider: doc.provider,
  };
}

export class PaymentMongooseRepository implements IPaymentRepository {
  async findByOrderId(orderId: string): Promise<IPayment | null> {
    const doc = await PaymentModel.findOne({ orderId }).lean<PaymentLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findManyByOrderIds(orderIds: string[]): Promise<IPayment[]> {
    if (orderIds.length === 0) return [];
    const docs = await PaymentModel.find({ orderId: { $in: orderIds } }).lean<PaymentLeanDocument[]>();
    return docs.map(toEntity);
  }

  async markAsApproved(orderId: string): Promise<IPayment> {
    const doc = await PaymentModel.findOneAndUpdate(
      { orderId },
      { $set: { status: 'aprovado' } },
      { new: true },
    ).lean<PaymentLeanDocument>();
    return toEntity(doc as PaymentLeanDocument);
  }

  async markAsApprovedIfPending(orderId: string): Promise<IPayment | null> {
    // specs/0226 REQ-A19 — `recusado` também: o cliente pode tentar outro cartão no mesmo checkout.
    const doc = await PaymentModel.findOneAndUpdate(
      { orderId, status: { $in: ['pendente', 'recusado'] } },
      { $set: { status: 'aprovado' } },
      { new: true },
    ).lean<PaymentLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async markAsRefusedIfPending(orderId: string): Promise<IPayment | null> {
    const doc = await PaymentModel.findOneAndUpdate({ orderId, status: 'pendente' }, { $set: { status: 'recusado' } }, { new: true }).lean<PaymentLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  // specs/0226 REQ-B1.
  async setMercadoPagoPixDetails(orderId: string, data: { externalReference: string; pixPayload: string }): Promise<IPayment> {
    const doc = await PaymentModel.findOneAndUpdate({ orderId }, { $set: { ...data, provider: 'mercadopago' } }, { new: true }).lean<PaymentLeanDocument>();
    return toEntity(doc as PaymentLeanDocument);
  }

  // specs/0101-integracao-asaas (fase 1).
  async setAsaasPixDetails(orderId: string, data: { externalReference: string; pixPayload: string }): Promise<IPayment> {
    const doc = await PaymentModel.findOneAndUpdate({ orderId }, { $set: { ...data, provider: 'asaas' } }, { new: true }).lean<PaymentLeanDocument>();
    return toEntity(doc as PaymentLeanDocument);
  }

  async markAsRefunded(orderId: string): Promise<IPayment> {
    const doc = await PaymentModel.findOneAndUpdate(
      { orderId },
      { $set: { status: 'estornado' } },
      { new: true },
    ).lean<PaymentLeanDocument>();
    return toEntity(doc as PaymentLeanDocument);
  }

  // specs/0170-integracao-mercado-pago.
  async setMercadoPagoCheckoutDetails(orderId: string, data: { externalReference: string; checkoutUrl: string }): Promise<IPayment> {
    const doc = await PaymentModel.findOneAndUpdate({ orderId }, { $set: { ...data, provider: 'mercadopago' } }, { new: true }).lean<PaymentLeanDocument>();
    return toEntity(doc as PaymentLeanDocument);
  }

  // specs/0101-integracao-asaas (fase 2).
  async setAsaasCheckoutDetails(orderId: string, data: { externalReference: string; checkoutUrl: string }): Promise<IPayment> {
    const doc = await PaymentModel.findOneAndUpdate({ orderId }, { $set: { ...data, provider: 'asaas' } }, { new: true }).lean<PaymentLeanDocument>();
    return toEntity(doc as PaymentLeanDocument);
  }

  async updateExternalReference(orderId: string, externalReference: string): Promise<IPayment> {
    const doc = await PaymentModel.findOneAndUpdate({ orderId }, { $set: { externalReference } }, { new: true }).lean<PaymentLeanDocument>();
    return toEntity(doc as PaymentLeanDocument);
  }

  // specs/0226 REQ-A15.
  async findOpenOrderNumbersWithPendingMercadoPagoPayment(restaurantId: string): Promise<number[]> {
    const openOrders = await OrderModel.find(
      { restaurantId, status: { $nin: ['entregue', 'cancelado'] } },
      { _id: 1, orderNumber: 1 },
    ).lean<{ _id: string; orderNumber: number }[]>();
    if (openOrders.length === 0) return [];
    const pending = await PaymentModel.find(
      { orderId: { $in: openOrders.map((order) => order._id) }, provider: 'mercadopago', status: 'pendente' },
      { orderId: 1 },
    ).lean<{ orderId: string }[]>();
    const pendingOrderIds = new Set(pending.map((payment) => payment.orderId));
    return openOrders
      .filter((order) => pendingOrderIds.has(order._id))
      .map((order) => order.orderNumber)
      .sort((a, b) => a - b);
  }
}
