import {
  IPurchaseOrder,
  IPurchaseOrderItem,
  PurchaseOrderStatus,
} from '../../domain/entities/purchase-order.entity';
import { IPurchaseOrderRepository } from '../../domain/repositories/purchase-order.repository.interface';
import { PurchaseOrderModel } from '../models/purchase-order.mongoose.model';

interface PurchaseOrderLeanDocument {
  _id: string;
  restaurantId: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  items: IPurchaseOrderItem[];
  totalValue: number;
  receivedAt?: Date;
  createdAt: Date;
}

function toEntity(doc: PurchaseOrderLeanDocument): IPurchaseOrder {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    supplierId: doc.supplierId,
    status: doc.status,
    items: doc.items.map((item) => ({
      rawMaterialId: item.rawMaterialId,
      quantity: item.quantity,
      unitCost: item.unitCost,
    })),
    totalValue: doc.totalValue,
    receivedAt: doc.receivedAt?.toISOString(),
    createdAt: doc.createdAt.toISOString(),
  };
}

export class PurchaseOrderMongooseRepository implements IPurchaseOrderRepository {
  async listByRestaurant(restaurantId: string): Promise<IPurchaseOrder[]> {
    const docs = await PurchaseOrderModel.find({ restaurantId })
      .sort({ createdAt: -1 })
      .lean<PurchaseOrderLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findById(id: string): Promise<IPurchaseOrder | null> {
    const doc = await PurchaseOrderModel.findById(id).lean<PurchaseOrderLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async create(restaurantId: string, supplierId: string, items: IPurchaseOrderItem[]): Promise<IPurchaseOrder> {
    const totalValue = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    const doc = await PurchaseOrderModel.create({
      restaurantId,
      supplierId,
      items,
      totalValue,
      status: 'aberto',
    });
    return toEntity(doc.toObject() as PurchaseOrderLeanDocument);
  }

  async markAsReceivedIfOpen(id: string, receivedAt: Date): Promise<IPurchaseOrder | null> {
    const doc = await PurchaseOrderModel.findOneAndUpdate(
      { _id: id, status: 'aberto' },
      { $set: { status: 'recebido', receivedAt } },
      { new: true },
    ).lean<PurchaseOrderLeanDocument>();
    return doc ? toEntity(doc) : null;
  }
}
