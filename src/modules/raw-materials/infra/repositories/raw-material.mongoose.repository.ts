import { IRawMaterial } from '../../domain/entities/raw-material.entity';
import { IRawMaterialRepository } from '../../domain/repositories/raw-material.repository.interface';
import { RawMaterialModel } from '../models/raw-material.mongoose.model';

interface RawMaterialLeanDocument {
  _id: string;
  restaurantId: string;
  name: string;
  priceDelta: number;
  isActive: boolean;
  unit: string;
  currentStock: number;
  minimumStockAlert?: number;
}

function toEntity(doc: RawMaterialLeanDocument): IRawMaterial {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    name: doc.name,
    priceDelta: doc.priceDelta,
    isActive: doc.isActive,
    unit: doc.unit,
    currentStock: doc.currentStock,
    minimumStockAlert: doc.minimumStockAlert,
  };
}

export class RawMaterialMongooseRepository implements IRawMaterialRepository {
  async listByRestaurant(restaurantId: string): Promise<IRawMaterial[]> {
    const docs = await RawMaterialModel.find({ restaurantId }).lean<RawMaterialLeanDocument[]>();
    return docs.map(toEntity);
  }

  async create(
    restaurantId: string,
    name: string,
    priceDelta: number,
    unit: string,
    minimumStockAlert?: number,
  ): Promise<IRawMaterial> {
    const doc = await RawMaterialModel.create({
      restaurantId,
      name,
      priceDelta,
      unit,
      minimumStockAlert,
      isActive: true,
      currentStock: 0,
    });
    return toEntity(doc.toObject() as RawMaterialLeanDocument);
  }

  async update(
    id: string,
    name: string,
    priceDelta: number,
    unit: string,
    minimumStockAlert?: number,
  ): Promise<IRawMaterial> {
    const doc = await RawMaterialModel.findByIdAndUpdate(
      id,
      { $set: { name, priceDelta, unit, minimumStockAlert } },
      { new: true },
    ).lean<RawMaterialLeanDocument>();
    return toEntity(doc as RawMaterialLeanDocument);
  }

  async setActive(id: string, isActive: boolean): Promise<IRawMaterial> {
    const doc = await RawMaterialModel.findByIdAndUpdate(
      id,
      { $set: { isActive } },
      { new: true },
    ).lean<RawMaterialLeanDocument>();
    return toEntity(doc as RawMaterialLeanDocument);
  }

  async findById(id: string): Promise<IRawMaterial | null> {
    const doc = await RawMaterialModel.findById(id).lean<RawMaterialLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async incrementStock(id: string, delta: number): Promise<IRawMaterial> {
    const doc = await RawMaterialModel.findByIdAndUpdate(
      id,
      { $inc: { currentStock: delta } },
      { new: true },
    ).lean<RawMaterialLeanDocument>();
    return toEntity(doc as RawMaterialLeanDocument);
  }
}
