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
  orderId?: string;
  operationId?: string;
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
    orderId: doc.orderId,
    operationId: doc.operationId,
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

  async listByProduct(productId: string): Promise<IStockMovement[]> {
    const docs = await StockMovementModel.find({ productId })
      .sort({ createdAt: 1 })
      .lean<StockMovementLeanDocument[]>();
    return docs.map(toEntity);
  }

  // Achado de auditoria pré-produção (31/10/2026) — "listas sem paginação em financeiro,
  // clientes e estoque": métodos NOVOS, separados dos acima de propósito (que continuam
  // intactos, sem paginar).
  async listByRawMaterialPage(rawMaterialId: string, pagination: { skip: number; limit: number }): Promise<{ items: IStockMovement[]; total: number }> {
    const query = { rawMaterialId };
    const [docs, total] = await Promise.all([
      StockMovementModel.find(query).sort({ createdAt: 1 }).skip(pagination.skip).limit(pagination.limit).lean<StockMovementLeanDocument[]>(),
      StockMovementModel.countDocuments(query),
    ]);
    return { items: docs.map(toEntity), total };
  }

  async listByProductPage(productId: string, pagination: { skip: number; limit: number }): Promise<{ items: IStockMovement[]; total: number }> {
    const query = { productId };
    const [docs, total] = await Promise.all([
      StockMovementModel.find(query).sort({ createdAt: 1 }).skip(pagination.skip).limit(pagination.limit).lean<StockMovementLeanDocument[]>(),
      StockMovementModel.countDocuments(query),
    ]);
    return { items: docs.map(toEntity), total };
  }

  async findByOperationId(restaurantId: string, operationId: string): Promise<IStockMovement | null> {
    const doc = await StockMovementModel.findOne({ restaurantId, operationId }).lean<StockMovementLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  // Achado crítico de auditoria pré-produção (31/10/2026) — "reserva de estoque no checkout:
  // N+1 sequencial por item/adicional": `StockReservationService` chamava `findByOperationId`
  // até duas vezes por item/adicional do pedido (detecção de reserva existente + do rollback
  // dela). Este método busca TODAS de uma vez, num só round-trip.
  async findManyByOperationIds(restaurantId: string, operationIds: string[]): Promise<IStockMovement[]> {
    if (operationIds.length === 0) return [];
    const docs = await StockMovementModel.find({ restaurantId, operationId: { $in: operationIds } }).lean<StockMovementLeanDocument[]>();
    return docs.map(toEntity);
  }
}
