import { RestaurantModel } from '../../../restaurants/infra/models/restaurant.mongoose.model';
import { RawMaterialModel } from '../../../raw-materials/infra/models/raw-material.mongoose.model';
import { ProductModel } from '../models/product.mongoose.model';
import { backfillStockTracking } from './backfill-stock-tracking';

jest.mock('../../../restaurants/infra/models/restaurant.mongoose.model', () => ({ RestaurantModel: { updateMany: jest.fn() } }));
jest.mock('../../../raw-materials/infra/models/raw-material.mongoose.model', () => ({ RawMaterialModel: { updateMany: jest.fn() } }));
jest.mock('../models/product.mongoose.model', () => ({ ProductModel: { distinct: jest.fn(), updateMany: jest.fn() } }));

describe('backfillStockTracking (specs/0108 REQ-14)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ProductModel.distinct as jest.Mock).mockResolvedValue(['restaurant-legacy']);
    (ProductModel.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 1 });
    (RawMaterialModel.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 1 });
    (RestaurantModel.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 1 });
  });

  it('preserves existing product stock as tracked and enables only its restaurant', async () => {
    await backfillStockTracking();

    expect(ProductModel.updateMany).toHaveBeenNthCalledWith(
      1,
      { tracksStock: { $exists: false }, stockQuantity: { $type: 'number' } },
      { $set: { tracksStock: true } },
    );
    expect(ProductModel.updateMany).toHaveBeenNthCalledWith(
      2,
      { tracksStock: { $exists: false } },
      { $set: { tracksStock: false } },
    );
    expect(RawMaterialModel.updateMany).toHaveBeenCalledWith(
      { tracksStock: { $exists: false } },
      { $set: { tracksStock: false } },
    );
    expect(RestaurantModel.updateMany).toHaveBeenNthCalledWith(
      1,
      { _id: { $in: ['restaurant-legacy'] }, stockControlEnabled: { $exists: false } },
      { $set: { stockControlEnabled: true } },
    );
    expect(RestaurantModel.updateMany).toHaveBeenNthCalledWith(
      2,
      { _id: { $nin: ['restaurant-legacy'] }, stockControlEnabled: { $exists: false } },
      { $set: { stockControlEnabled: false } },
    );
  });
});
