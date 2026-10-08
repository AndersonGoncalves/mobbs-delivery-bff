import { OrderMongooseRepository } from '../../../orders/infra/repositories/order.mongoose.repository';
import { RestaurantModel } from '../../../restaurants/infra/models/restaurant.mongoose.model';
import { ProductModel } from '../models/product.mongoose.model';
import { backfillManualBestSellers } from './backfill-manual-best-sellers';

jest.mock('../../../restaurants/infra/models/restaurant.mongoose.model', () => ({
  RestaurantModel: { find: jest.fn() },
}));
jest.mock('../models/product.mongoose.model', () => ({
  ProductModel: { updateOne: jest.fn(), updateMany: jest.fn() },
}));
jest.mock('../../../orders/infra/repositories/order.mongoose.repository');

function mockRestaurantsFind(restaurants: { _id: string }[]) {
  (RestaurantModel.find as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(restaurants) }),
  });
}

describe('backfillManualBestSellers (specs/0117-vitrine-manual-e-ajustes-formularios)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('marca isBestSeller/bestSellerOrder a partir do ranking calculado, só pra restaurante com showBestSellers ligado', async () => {
    mockRestaurantsFind([{ _id: 'r-1' }]);
    const getBestSellingProductIds = jest.fn().mockResolvedValue(['p-2', 'p-1']);
    (OrderMongooseRepository as jest.Mock).mockImplementation(() => ({ getBestSellingProductIds }));
    (ProductModel.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 1 });
    (ProductModel.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 0 });

    await backfillManualBestSellers();

    expect(RestaurantModel.find).toHaveBeenCalledWith({ showBestSellers: true });
    expect(getBestSellingProductIds).toHaveBeenCalledWith('r-1', 10);
    expect(ProductModel.updateOne).toHaveBeenCalledWith(
      { _id: 'p-2', isBestSeller: { $exists: false } },
      { $set: { isBestSeller: true, bestSellerOrder: 0 } },
    );
    expect(ProductModel.updateOne).toHaveBeenCalledWith(
      { _id: 'p-1', isBestSeller: { $exists: false } },
      { $set: { isBestSeller: true, bestSellerOrder: 1 } },
    );
    // Resto dos produtos do restaurante (fora do ranking) vira `false` explícito.
    expect(ProductModel.updateMany).toHaveBeenCalledWith(
      { restaurantId: 'r-1', isBestSeller: { $exists: false } },
      { $set: { isBestSeller: false, bestSellerOrder: 0 } },
    );
  });

  it('é idempotente: $exists:false não encontra mais nenhum documento numa segunda chamada (não sobrescreve curadoria manual)', async () => {
    mockRestaurantsFind([{ _id: 'r-1' }]);
    (OrderMongooseRepository as jest.Mock).mockImplementation(() => ({ getBestSellingProductIds: jest.fn().mockResolvedValue(['p-1']) }));
    (ProductModel.updateOne as jest.Mock).mockResolvedValue({ modifiedCount: 0 });
    (ProductModel.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 0 });

    await expect(backfillManualBestSellers()).resolves.toBeUndefined();

    // A query continua rodando (sem controle externo de "já rodou"), mas o filtro `$exists:
    // false` garante que nenhum `$set` altera um documento já migrado/curado manualmente.
    expect(ProductModel.updateOne).toHaveBeenCalled();
  });

  it('restaurante sem showBestSellers ligado nunca é consultado (query já filtra)', async () => {
    mockRestaurantsFind([]);

    await backfillManualBestSellers();

    expect(ProductModel.updateOne).not.toHaveBeenCalled();
    expect(ProductModel.updateMany).not.toHaveBeenCalled();
  });
});
