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
  deliveryMotoboy?: { id: string; name: string };
  tableId?: string;
  tableName?: string;
  tableWaiter?: IOrder['tableWaiter'];
  serviceChargePercent?: number;
  serviceChargeAmount?: number;
  coverCharge?: number;
  tableAdjustment?: IOrder['tableAdjustment'];
  tablePeopleCount?: number;
  tablePayments?: IOrder['tablePayments'];
  tableClosedAt?: string;
  tableMergedIntoOrderId?: string;
  notes?: string;
  status: IOrder['status'];
  statusHistory: { status: IOrder['status']; changedAt: Date; changedBy?: string; reason?: string }[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  couponCode?: string;
  paymentMethod: PaymentMethod;
  cashChangeFor?: number;
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
    deliveryMotoboy: doc.deliveryMotoboy,
    tableId: doc.tableId,
    tableName: doc.tableName,
    tableWaiter: doc.tableWaiter,
    serviceChargePercent: doc.serviceChargePercent,
    serviceChargeAmount: doc.serviceChargeAmount,
    coverCharge: doc.coverCharge,
    tableAdjustment: doc.tableAdjustment,
    tablePeopleCount: doc.tablePeopleCount,
    tablePayments: doc.tablePayments ?? [],
    tableClosedAt: doc.tableClosedAt,
    tableMergedIntoOrderId: doc.tableMergedIntoOrderId,
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
    couponCode: doc.couponCode,
    paymentMethod: doc.paymentMethod,
    cashChangeFor: doc.cashChangeFor,
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
      status: input.initialStatus ?? 'aguardandoConfirmacao',
      statusHistory: [{ status: input.initialStatus ?? 'aguardandoConfirmacao', changedAt: now, changedBy: undefined }],
      subtotal: input.subtotal,
      deliveryFee: input.deliveryFee,
      discount: input.discount,
      total: input.total,
      couponCode: input.couponCode,
      paymentMethod: input.paymentMethod,
      cashChangeFor: input.cashChangeFor,
      tableId: input.tableId,
      tableName: input.tableName,
      tableWaiter: input.tableWaiter,
      serviceChargePercent: input.serviceChargePercent,
      serviceChargeAmount: input.serviceChargeAmount,
      coverCharge: input.coverCharge,
      tableAdjustment: input.tableAdjustment,
      tablePeopleCount: input.tablePeopleCount,
      tablePayments: input.tablePayments ?? [],
      tableClosedAt: input.tableClosedAt,
    });

    // docs/architecture/data-model.md §Payment — registro separado, usado por
    // specs/0008-acompanhamento-vendas mais adiante; não retornado nesta resposta (o cliente não
    // precisa dele de volta, só o BFF/retaguarda).
    if (input.orderType !== 'table') {
      await PaymentModel.create({
        orderId: doc.id,
        method: input.paymentMethod,
        cardBrand: input.cardBrand,
        status: 'pendente',
        amount: input.total,
      });
    }

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

  async assignDeliveryMotoboy(id: string, motoboy?: { id: string; name: string }): Promise<IOrder> {
    const update = motoboy ? { $set: { deliveryMotoboy: motoboy } } : { $unset: { deliveryMotoboy: 1 } };
    const doc = await OrderModel.findByIdAndUpdate(id, update, { new: true }).lean<OrderLeanDocument>();
    return toEntity(doc as OrderLeanDocument);
  }

  async findActiveTableOrder(restaurantId: string, tableId?: string): Promise<IOrder | null> {
    const tableFilter = tableId ? { tableId } : { tableId: { $exists: false } };
    const doc = await OrderModel.findOne({ restaurantId, orderType: 'table', status: { $nin: ['entregue', 'cancelado'] }, ...tableFilter })
      .sort({ createdAt: -1 })
      .lean<OrderLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findClosedTableOrders(restaurantId: string, from: Date, to: Date): Promise<IOrder[]> {
    const docs = await OrderModel.find({
      restaurantId,
      orderType: 'table',
      status: 'entregue',
      tableMergedIntoOrderId: { $exists: false },
      tableClosedAt: { $gte: from.toISOString(), $lt: to.toISOString() },
    })
      .sort({ tableClosedAt: -1 })
      .lean<OrderLeanDocument[]>();
    return docs.map(toEntity);
  }

  async updateTableOrder(id: string, restaurantId: string, patch: Partial<IOrder>): Promise<IOrder | null> {
    const doc = await OrderModel.findOneAndUpdate(
      { _id: id, restaurantId, orderType: 'table', status: { $nin: ['entregue', 'cancelado'] } },
      { $set: patch },
      { new: true },
    ).lean<OrderLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async addTablePayment(id: string, restaurantId: string, payment: NonNullable<IOrder['tablePayments']>[number]): Promise<IOrder | null> {
    const doc = await OrderModel.findOneAndUpdate(
      { _id: id, restaurantId, orderType: 'table', status: { $nin: ['entregue', 'cancelado'] } },
      { $push: { tablePayments: payment } },
      { new: true },
    ).lean<OrderLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  /**
   * specs/0008-acompanhamento-vendas REQ-1 — mais antigo primeiro (fila de atendimento).
   * `$nin` exclui `entregue`/`cancelado`, que já saíram do fluxo de acompanhamento ativo.
   */
  async findLastDeliveredAt(restaurantId: string): Promise<Date | null> {
    const doc = await OrderModel.findOne({ restaurantId, status: 'entregue' }, { createdAt: 1 }).sort({ createdAt: -1 }).lean<{ createdAt: Date }>();
    return doc ? doc.createdAt : null;
  }

  async findDeliveredByRestaurantBetween(restaurantId: string, start: Date, end: Date): Promise<IOrder[]> {
    const docs = await OrderModel.find({ restaurantId, status: 'entregue', createdAt: { $gte: start, $lt: end } })
      .sort({ createdAt: 1 })
      .lean<OrderLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findDeliveredByRestaurantCompletedBetween(restaurantId: string, from: Date, to: Date): Promise<IOrder[]> {
    const docs = await OrderModel.find({
      restaurantId,
      orderType: 'delivery',
      status: 'entregue',
      statusHistory: { $elemMatch: { status: 'entregue', changedAt: { $gte: from, $lt: to } } },
    })
      .sort({ createdAt: 1 })
      .lean<OrderLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findActiveByRestaurant(restaurantId: string): Promise<IOrder[]> {
    const docs = await OrderModel.find({ restaurantId, status: { $nin: ['entregue', 'cancelado'] } })
      .sort({ createdAt: 1 })
      .lean<OrderLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findByRestaurantBetween(restaurantId: string, from: Date, to: Date): Promise<IOrder[]> {
    const docs = await OrderModel.find({ restaurantId, createdAt: { $gte: from, $lt: to } })
      .sort({ createdAt: 1 })
      .lean<OrderLeanDocument[]>();
    return docs.map(toEntity);
  }

  /** REQ-4 — `totalRevenue` conta só pedidos `entregue` (receita realizada). */
  async getSalesSummary(restaurantId: string, periodStart: Date, periodEnd: Date): Promise<ISalesSummary> {
    const [result] = await OrderModel.aggregate<{
      totalOrders: number;
      totalRevenue: number;
      tableRevenue: number;
      cancelledOrders: number;
    }>([
      { $match: { restaurantId, createdAt: { $gte: periodStart, $lte: periodEnd } } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: { $cond: [{ $eq: ['$status', 'entregue'] }, '$total', 0] } },
          tableRevenue: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'entregue'] }, { $eq: ['$orderType', 'table'] }] }, '$total', 0] } },
          cancelledOrders: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'cancelado'] }, { $eq: [{ $ifNull: ['$tableMergedIntoOrderId', null] }, null] }] }, 1, 0] } },
        },
      },
    ]);

    return {
      restaurantId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      totalOrders: result?.totalOrders ?? 0,
      totalRevenue: result?.totalRevenue ?? 0,
      tableRevenue: result?.tableRevenue ?? 0,
      cancelledOrders: result?.cancelledOrders ?? 0,
    };
  }

  async getTableSalesBetween(restaurantId: string, from: Date, to: Date): Promise<number> {
    const [result] = await OrderModel.aggregate<{ total: number }>([
      { $match: {
        restaurantId,
        orderType: 'table',
        tableMergedIntoOrderId: { $exists: false },
        'tablePayments.paidAt': { $gte: from.toISOString(), $lt: to.toISOString() },
      } },
      { $unwind: '$tablePayments' },
      { $match: { 'tablePayments.paidAt': { $gte: from.toISOString(), $lt: to.toISOString() } } },
      { $group: { _id: null, total: { $sum: '$tablePayments.amount' } } },
    ]);
    return result?.total ?? 0;
  }

  /** specs/0022-cupons-desconto REQ-6. */
  async countByCustomerAndCoupon(restaurantId: string, customerId: string, couponCode: string): Promise<number> {
    return OrderModel.countDocuments({ restaurantId, customerId, couponCode });
  }

  async countByProduct(restaurantId: string, productId: string): Promise<number> {
    return OrderModel.countDocuments({ restaurantId, 'items.productId': productId });
  }

  /**
   * specs/0028-destaques-vendidos-banners REQ-2 — soma `quantity` por `productId` só em pedidos
   * `entregue` (mesma regra de `totalRevenue` acima), do mais pro menos vendido.
   */
  async getBestSellingProductIds(restaurantId: string, limit: number): Promise<string[]> {
    const results = await OrderModel.aggregate<{ _id: string; totalQuantity: number }>([
      { $match: { restaurantId, status: 'entregue' } },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId', totalQuantity: { $sum: '$items.quantity' } } },
      { $sort: { totalQuantity: -1 } },
      { $limit: limit },
    ]);

    return results.map((result) => result._id);
  }

  async hasDeliveredOrder(customerId: string, restaurantId: string): Promise<boolean> {
    const count = await OrderModel.countDocuments({ customerId, restaurantId, status: 'entregue' }).limit(1);
    return count > 0;
  }

  async getPurchasedProductIds(customerId: string, restaurantId: string): Promise<string[]> {
    const results = await OrderModel.aggregate<{ _id: string }>([
      { $match: { customerId, restaurantId, status: 'entregue' } },
      { $unwind: '$items' },
      { $group: { _id: '$items.productId' } },
    ]);
    return results.map((result) => result._id);
  }
}
