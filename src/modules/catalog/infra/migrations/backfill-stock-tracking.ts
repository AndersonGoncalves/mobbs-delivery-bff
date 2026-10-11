import { RestaurantModel } from '../../../restaurants/infra/models/restaurant.mongoose.model';
import { RawMaterialModel } from '../../../raw-materials/infra/models/raw-material.mongoose.model';
import { ProductModel } from '../models/product.mongoose.model';

/** specs/0108 REQ-14 — preserves stock explicitly configured before tracksStock existed. */
export async function backfillStockTracking(): Promise<void> {
  const restaurantIdsWithLegacyStock = await ProductModel.distinct('restaurantId', {
    stockQuantity: { $type: 'number' },
  }) as string[];

  await ProductModel.updateMany(
    { tracksStock: { $exists: false }, stockQuantity: { $type: 'number' } },
    { $set: { tracksStock: true } },
  );
  await ProductModel.updateMany(
    { tracksStock: { $exists: false } },
    { $set: { tracksStock: false } },
  );
  await RawMaterialModel.updateMany(
    { tracksStock: { $exists: false } },
    { $set: { tracksStock: false } },
  );
  await RestaurantModel.updateMany(
    { _id: { $in: restaurantIdsWithLegacyStock }, stockControlEnabled: { $exists: false } },
    { $set: { stockControlEnabled: true } },
  );
  await RestaurantModel.updateMany(
    { _id: { $nin: restaurantIdsWithLegacyStock }, stockControlEnabled: { $exists: false } },
    { $set: { stockControlEnabled: false } },
  );
}
