import { randomBytes } from 'crypto';

import { IOrder, IOrderItem, ISalesSummary, OrderStatus, OrderType, PaymentMethod } from '../../domain/entities/order.entity';
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
  statusHistory: { status: IOrder['status']; changedAt: Date; changedBy?: string; reason?: string }[];
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
      reason: entry.reason,
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

  /** REQ-1 (`specs/0006-acompanhamento-pedido`) — mais recente primeiro. */
  async findManyByCustomer(customerId: string): Promise<IOrder[]> {
    const docs = await OrderModel.find({ customerId }).sort({ createdAt: -1 }).lean<OrderLeanDocument[]>();
    return docs.map(toEntity);
  }

  /**
   * specs/0016-clientes-retaguarda REQ-3 — mesmo filtro de `findManyByCustomer`, com
   * `restaurantId` adicional pra nunca vazar pedidos do mesmo cliente feitos em outro
   * restaurante; mais recente primeiro.
   */
  async findManyByCustomerAndRestaurant(customerId: string, restaurantId: string): Promise<IOrder[]> {
    const docs = await OrderModel.find({ customerId, restaurantId }).sort({ createdAt: -1 }).lean<OrderLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findById(id: string): Promise<IOrder | null> {
    const doc = await OrderModel.findById(id).lean<OrderLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findByTrackingToken(token: string): Promise<IOrder | null> {
    const doc = await OrderModel.findOne({ trackingToken: token }).lean<OrderLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async updateStatus(id: string, status: OrderStatus, changedBy?: string, reason?: string): Promise<IOrder> {
    const doc = await OrderModel.findByIdAndUpdate(
      id,
      { $set: { status }, $push: { statusHistory: { status, changedAt: new Date(), changedBy, reason } } },
      { new: true },
    ).lean<OrderLeanDocument>();
    return toEntity(doc as OrderLeanDocument);
  }

  /**
   * specs/0008-acompanhamento-vendas REQ-1 — mais antigo primeiro (fila de atendimento).
   * `$nin` exclui `entregue`/`cancelado`, que já saíram do fluxo de acompanhamento ativo.
   */
  async findActiveByRestaurant(restaurantId: string): Promise<IOrder[]> {
    const docs = await OrderModel.find({ restaurantId, status: { $nin: ['entregue', 'cancelado'] } })
      .sort({ createdAt: 1 })
      .lean<OrderLeanDocument[]>();
    return docs.map(toEntity);
  }

  /** REQ-4 — `totalRevenue` conta só pedidos `entregue` (receita realizada). */
  async getSalesSummary(restaurantId: string, periodStart: Date, periodEnd: Date): Promise<ISalesSummary> {
    const [result] = await OrderModel.aggregate<{
      totalOrders: number;
      totalRevenue: number;
      cancelledOrders: number;
    }>([
      { $match: { restaurantId, createdAt: { $gte: periodStart, $lte: periodEnd } } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: { $cond: [{ $eq: ['$status', 'entregue'] }, '$total', 0] } },
          cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'cancelado'] }, 1, 0] } },
        },
      },
    ]);

    return {
      restaurantId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      totalOrders: result?.totalOrders ?? 0,
      totalRevenue: result?.totalRevenue ?? 0,
      cancelledOrders: result?.cancelledOrders ?? 0,
    };
  }
}
