import { TableWaiter } from '../../domain/entities/table-service.entity';
import { ITableWaiterRepository } from '../../domain/repositories/waiter.repository.interface';
import { TableWaiterModel } from '../models/table-waiter.mongoose.model';

interface TableWaiterLeanDocument {
  _id: string;
  restaurantId: string;
  name: string;
  isActive: boolean;
}

function toEntity(doc: TableWaiterLeanDocument): TableWaiter {
  return { id: doc._id, restaurantId: doc.restaurantId, name: doc.name, isActive: doc.isActive };
}

export class TableWaiterMongooseRepository implements ITableWaiterRepository {
  async listByRestaurant(restaurantId: string): Promise<TableWaiter[]> {
    const docs = await TableWaiterModel.find({ restaurantId }).sort({ name: 1 }).lean<TableWaiterLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findById(id: string, restaurantId: string): Promise<TableWaiter | null> {
    const doc = await TableWaiterModel.findOne({ _id: id, restaurantId }).lean<TableWaiterLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async create(restaurantId: string, name: string): Promise<TableWaiter> {
    const doc = await TableWaiterModel.create({ restaurantId, name: name.trim(), isActive: true });
    return toEntity(doc.toObject() as TableWaiterLeanDocument);
  }

  async update(id: string, restaurantId: string, name: string): Promise<TableWaiter | null> {
    const doc = await TableWaiterModel.findOneAndUpdate(
      { _id: id, restaurantId },
      { $set: { name: name.trim() } },
      { new: true },
    ).lean<TableWaiterLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async remove(id: string, restaurantId: string): Promise<boolean> {
    const result = await TableWaiterModel.deleteOne({ _id: id, restaurantId });
    return result.deletedCount === 1;
  }
}