import {
  CreateStockMovementInput,
  IStockMovement,
  StockMovementType,
} from '../../domain/entities/stock-movement.entity';
import { IStockMovementRepository } from '../../domain/repositories/stock-movement.repository.interface';
import { StockMovementModel } from '../models/stock-movement.mongoose.model';

interface StockMovementLeanDocument {
  _id: string;
  restaurantId: string;
  rawMaterialId?: string;
  productId?: string;
  type: StockMovementType;
  quantity: number;
  reason?: string;
  purchaseOrderId?: string;
  createdBy?: string;
  createdAt: Date;
}

function toEntity(doc: StockMovementLeanDocument): IStockMovement {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    rawMaterialId: doc.rawMaterialId,
    productId: doc.productId,
    type: doc.type,
    quantity: doc.quantity,
    reason: doc.reason,
    purchaseOrderId: doc.purchaseOrderId,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt.toISOString(),
  };
}

export class StockMovementMongooseRepository implements IStockMovementRepository {
  async create(input: CreateStockMovementInput): Promise<IStockMovement> {
    const doc = await StockMovementModel.create(input);
    return toEntity(doc.toObject() as StockMovementLeanDocument);
  }

  async listByRawMaterial(rawMaterialId: string): Promise<IStockMovement[]> {
    const docs = await StockMovementModel.find({ rawMaterialId })
      .sort({ createdAt: 1 })
      .lean<StockMovementLeanDocument[]>();
    return docs.map(toEntity);
  }
}
