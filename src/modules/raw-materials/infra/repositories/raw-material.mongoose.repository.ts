import { IRawMaterial } from '../../domain/entities/raw-material.entity';
import { IRawMaterialListFilters, IRawMaterialRepository } from '../../domain/repositories/raw-material.repository.interface';
import { escapeRegex } from '../../../../shared/utils/escape-regex';
import { RawMaterialModel } from '../models/raw-material.mongoose.model';

interface RawMaterialLeanDocument {
  _id: string;
  restaurantId: string;
  name: string;
  priceDelta: number;
  description?: string;
  isActive: boolean;
  unit: string;
  currentStock: number;
  tracksStock?: boolean;
  minimumStockAlert?: number;
}

function toEntity(doc: RawMaterialLeanDocument): IRawMaterial {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    name: doc.name,
    priceDelta: doc.priceDelta,
    description: doc.description,
    isActive: doc.isActive,
    unit: doc.unit,
    currentStock: doc.currentStock,
    tracksStock: doc.tracksStock ?? false,
    minimumStockAlert: doc.minimumStockAlert,
  };
}

export class RawMaterialMongooseRepository implements IRawMaterialRepository {
  async listByRestaurant(restaurantId: string, filters?: IRawMaterialListFilters): Promise<IRawMaterial[]> {
    const query: Record<string, unknown> = { restaurantId };
    if (filters?.name) query.name = { $regex: escapeRegex(filters.name), $options: 'i' };
    if (filters?.isActive !== undefined) query.isActive = filters.isActive;
    const docs = await RawMaterialModel.find(query).lean<RawMaterialLeanDocument[]>();
    return docs.map(toEntity);
  }

  async create(
    restaurantId: string,
    name: string,
    priceDelta: number,
    unit: string,
    minimumStockAlert?: number,
    description?: string,
    tracksStock = false,
  ): Promise<IRawMaterial> {
    const doc = await RawMaterialModel.create({
      restaurantId,
      name,
      priceDelta,
      unit,
      minimumStockAlert,
      description,
      tracksStock,
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
    description?: string,
    tracksStock?: boolean,
  ): Promise<IRawMaterial> {
    const patch: Record<string, unknown> = { name, priceDelta, unit, minimumStockAlert, description };
    if (tracksStock !== undefined) patch.tracksStock = tracksStock;
    const doc = await RawMaterialModel.findByIdAndUpdate(
      id,
      { $set: patch },
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

  async remove(id: string): Promise<void> {
    await RawMaterialModel.findByIdAndDelete(id);
  }

  async incrementStock(id: string, delta: number): Promise<IRawMaterial> {
    const doc = await RawMaterialModel.findByIdAndUpdate(
      id,
      { $inc: { currentStock: delta } },
      { new: true },
    ).lean<RawMaterialLeanDocument>();
    return toEntity(doc as RawMaterialLeanDocument);
  }

  async decrementStockIfAvailable(id: string, quantity: number, requireTracking = true): Promise<boolean> {
    const filter = {
      _id: id,
      currentStock: { $gte: quantity },
      ...(requireTracking ? { tracksStock: true } : {}),
    };
    const result = await RawMaterialModel.updateOne(
      filter,
      { $inc: { currentStock: -quantity } },
    );
    return result.modifiedCount > 0;
  }
}
