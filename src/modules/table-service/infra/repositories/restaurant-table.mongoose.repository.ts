import { RestaurantTable, TablePosition } from '../../domain/entities/table-service.entity';
import { IRestaurantTableRepository, RestaurantTableInput } from '../../domain/repositories/table.repository.interface';
import { RestaurantTableModel } from '../models/restaurant-table.mongoose.model';

interface RestaurantTableLeanDocument {
  _id: string;
  restaurantId: string;
  name: string;
  normalizedName: string;
  capacity?: number;
  position: TablePosition;
  activeOrderId?: string;
}

function normalizeName(name: string) {
  return name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function defaultPosition(index: number): TablePosition {
  return { x: 24 + (index % 2) * 176, y: 24 + Math.floor(index / 2) * 132, width: 150, height: 100 };
}

function toEntity(doc: RestaurantTableLeanDocument): RestaurantTable {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    name: doc.name,
    normalizedName: doc.normalizedName,
    capacity: doc.capacity,
    position: doc.position,
    activeOrderId: doc.activeOrderId,
  };
}

export class RestaurantTableMongooseRepository implements IRestaurantTableRepository {
  async listByRestaurant(restaurantId: string): Promise<RestaurantTable[]> {
    const docs = await RestaurantTableModel.find({ restaurantId }).sort({ name: 1 }).lean<RestaurantTableLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findById(id: string, restaurantId: string): Promise<RestaurantTable | null> {
    const doc = await RestaurantTableModel.findOne({ _id: id, restaurantId }).lean<RestaurantTableLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findByNormalizedName(restaurantId: string, normalizedName: string): Promise<RestaurantTable | null> {
    const doc = await RestaurantTableModel.findOne({ restaurantId, normalizedName }).lean<RestaurantTableLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async create(restaurantId: string, input: RestaurantTableInput): Promise<RestaurantTable> {
    const name = input.name.trim();
    const index = await RestaurantTableModel.countDocuments({ restaurantId });
    const doc = await RestaurantTableModel.create({ restaurantId, ...input, name, normalizedName: normalizeName(name), position: defaultPosition(index) });
    return toEntity(doc.toObject() as RestaurantTableLeanDocument);
  }

  async createMany(restaurantId: string, inputs: RestaurantTableInput[]): Promise<RestaurantTable[]> {
    const firstIndex = await RestaurantTableModel.countDocuments({ restaurantId });
    const docs = await RestaurantTableModel.insertMany(
      inputs.map((input, offset) => {
        const name = input.name.trim();
        return { restaurantId, ...input, name, normalizedName: normalizeName(name), position: defaultPosition(firstIndex + offset) };
      }),
    );
    return docs.map((doc) => toEntity(doc.toObject() as RestaurantTableLeanDocument));
  }

  async update(id: string, restaurantId: string, input: RestaurantTableInput): Promise<RestaurantTable | null> {
    const name = input.name.trim();
    const doc = await RestaurantTableModel.findOneAndUpdate(
      { _id: id, restaurantId },
      { $set: { ...input, name, normalizedName: normalizeName(name) } },
      { new: true },
    ).lean<RestaurantTableLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async deleteIfFree(id: string, restaurantId: string): Promise<boolean> {
    const result = await RestaurantTableModel.deleteOne({ _id: id, restaurantId, activeOrderId: { $exists: false } });
    return result.deletedCount === 1;
  }

  async claimForOrder(id: string, restaurantId: string, orderId: string): Promise<boolean> {
    const doc = await RestaurantTableModel.findOneAndUpdate(
      { _id: id, restaurantId, activeOrderId: { $exists: false } },
      { $set: { activeOrderId: orderId } },
      { new: true },
    );
    return !!doc;
  }

  async releaseFromOrder(id: string, restaurantId: string, orderId: string): Promise<boolean> {
    const result = await RestaurantTableModel.updateOne(
      { _id: id, restaurantId, activeOrderId: orderId },
      { $unset: { activeOrderId: 1 } },
    );
    return result.modifiedCount === 1;
  }

  async updatePosition(id: string, restaurantId: string, position: TablePosition): Promise<RestaurantTable | null> {
    const doc = await RestaurantTableModel.findOneAndUpdate(
      { _id: id, restaurantId },
      { $set: { position } },
      { new: true },
    ).lean<RestaurantTableLeanDocument>();
    return doc ? toEntity(doc) : null;
  }
}