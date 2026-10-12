import { CounterPositions, TableMapDecoration, TableMapLayout } from '../../domain/entities/table-service.entity';
import { ITableMapLayoutRepository } from '../../domain/repositories/table-map-layout.repository.interface';
import { TableMapLayoutModel } from '../models/table-map-layout.mongoose.model';

interface TableMapLayoutLeanDocument {
  restaurantId: string;
  decorations: TableMapDecoration[];
  spendingLimit?: number;
  counterPositions?: CounterPositions;
}

export class TableMapLayoutMongooseRepository implements ITableMapLayoutRepository {
  async getByRestaurant(restaurantId: string): Promise<TableMapLayout> {
    const doc = await TableMapLayoutModel.findOne({ restaurantId }).lean<TableMapLayoutLeanDocument>();
    return { restaurantId, decorations: doc?.decorations ?? [], spendingLimit: doc?.spendingLimit, counterPositions: doc?.counterPositions ?? {} };
  }

  async save(restaurantId: string, decorations: TableMapDecoration[], spendingLimit?: number | null, counterPositions?: CounterPositions): Promise<TableMapLayout> {
    const set: Record<string, unknown> = { decorations };
    if (typeof spendingLimit === 'number') set.spendingLimit = spendingLimit;
    if (counterPositions !== undefined) set.counterPositions = counterPositions;
    const doc = await TableMapLayoutModel.findOneAndUpdate(
      { restaurantId },
      { $set: set, ...(spendingLimit === null ? { $unset: { spendingLimit: 1 } } : {}) },
      { new: true, upsert: true },
    ).lean<TableMapLayoutLeanDocument>();
    return { restaurantId: doc!.restaurantId, decorations: doc!.decorations ?? [], spendingLimit: doc!.spendingLimit, counterPositions: doc!.counterPositions ?? {} };
  }
}