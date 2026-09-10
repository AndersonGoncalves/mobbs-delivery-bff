import { IPayment, PaymentMethod, PaymentStatus } from '../../domain/entities/order.entity';
import { IPaymentRepository } from '../../domain/repositories/payment.repository.interface';
import { PaymentModel } from '../models/payment.mongoose.model';

interface PaymentLeanDocument {
  _id: string;
  orderId: string;
  method: PaymentMethod;
  cardBrand?: string;
  status: PaymentStatus;
  amount: number;
  externalReference?: string;
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
}
