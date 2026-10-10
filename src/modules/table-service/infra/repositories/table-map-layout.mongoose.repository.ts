import { TableMapDecoration, TableMapLayout } from '../../domain/entities/table-service.entity';
import { ITableMapLayoutRepository } from '../../domain/repositories/table-map-layout.repository.interface';
import { TableMapLayoutModel } from '../models/table-map-layout.mongoose.model';

interface TableMapLayoutLeanDocument {
  restaurantId: string;
  decorations: TableMapDecoration[];
  spendingLimit?: number;
}

export class TableMapLayoutMongooseRepository implements ITableMapLayoutRepository {
  async getByRestaurant(restaurantId: string): Promise<TableMapLayout> {
    const doc = await TableMapLayoutModel.findOne({ restaurantId }).lean<TableMapLayoutLeanDocument>();
    return { restaurantId, decorations: doc?.decorations ?? [], spendingLimit: doc?.spendingLimit };
  }

  async save(restaurantId: string, decorations: TableMapDecoration[], spendingLimit?: number | null): Promise<TableMapLayout> {
    const doc = await TableMapLayoutModel.findOneAndUpdate(
      { restaurantId },
      {
        $set: { decorations },
        ...(spendingLimit === undefined ? {} : spendingLimit === null ? { $unset: { spendingLimit: 1 } } : { $set: { decorations, spendingLimit } }),
      },
      { new: true, upsert: true },
    ).lean<TableMapLayoutLeanDocument>();
    return { restaurantId: doc!.restaurantId, decorations: doc!.decorations ?? [], spendingLimit: doc!.spendingLimit };
  }
}