import { randomBytes } from 'crypto';

import { IOrder, IOrderItem, OrderType, PaymentMethod } from '../../domain/entities/order.entity';
import { IOrderRepository, NewOrderInput } from '../../domain/repositories/order.repository.interface';
import { OrderCounterModel } from '../models/order-counter.mongoose.model';
import { OrderModel } from '../models/order.mongoose.model';
import { PaymentModel } from '../models/payment.mongoose.model';

interface OrderLeanDocument {
  _id: string;
  orderNumber: number;
  trackingToken: string;
  customerId: string;
  restaurantId: string;
  items: IOrderItem[];
  orderType: OrderType;
  deliveryAddress?: string;
  notes?: string;
  status: IOrder['status'];
  statusHistory: { status: IOrder['status']; changedAt: Date; changedBy?: string }[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  createdAt: Date;
  estimatedDeliveryAt?: Date;
}

function toEntity(doc: OrderLeanDocument): IOrder {
  return {
    id: doc._id,
    orderNumber: doc.orderNumber,
    trackingToken: doc.trackingToken,
    customerId: doc.customerId,
    restaurantId: doc.restaurantId,
    items: doc.items ?? [],
    orderType: doc.orderType,
    deliveryAddress: doc.deliveryAddress,
    notes: doc.notes,
    status: doc.status,
    statusHistory: (doc.statusHistory ?? []).map((entry) => ({
      status: entry.status,
      changedAt: entry.changedAt.toISOString(),
      changedBy: entry.changedBy,
    })),
    subtotal: doc.subtotal,
    deliveryFee: doc.deliveryFee,
    discount: doc.discount,
    total: doc.total,
    paymentMethod: doc.paymentMethod,
    createdAt: doc.createdAt.toISOString(),
    estimatedDeliveryAt: doc.estimatedDeliveryAt?.toISOString(),
  };
}

export class OrderMongooseRepository implements IOrderRepository {
  async create(input: NewOrderInput): Promise<IOrder> {
    const orderNumber = await this.nextOrderNumber(input.restaurantId);
    const trackingToken = randomBytes(18).toString('hex');
    const now = new Date();

    const doc = await OrderModel.create({
      orderNumber,
      trackingToken,
      customerId: input.customerId,
      restaurantId: input.restaurantId,
      items: input.items,
      orderType: input.orderType,
      deliveryAddress: input.deliveryAddress,
      notes: input.notes,
      status: 'aguardandoConfirmacao',
      statusHistory: [{ status: 'aguardandoConfirmacao', changedAt: now, changedBy: undefined }],
      subtotal: input.subtotal,
      deliveryFee: input.deliveryFee,
      discount: input.discount,
      total: input.total,
      paymentMethod: input.paymentMethod,
    });

    // docs/architecture/data-model.md §Payment — registro separado, usado por
    // specs/0008-acompanhamento-vendas mais adiante; não retornado nesta resposta (o cliente não
    // precisa dele de volta, só o BFF/retaguarda).
    await PaymentModel.create({
      orderId: doc.id,
      method: input.paymentMethod,
      cardBrand: input.cardBrand,
      status: 'pendente',
      amount: input.total,
    });

    return toEntity(doc.toObject() as OrderLeanDocument);
  }

  private async nextOrderNumber(restaurantId: string): Promise<number> {
    const counter = await OrderCounterModel.findByIdAndUpdate(
      restaurantId,
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    return counter!.seq;
  }
}
