import { IFavorite } from '../../domain/entities/customer.entity';
import { IFavoriteRepository } from '../../domain/repositories/favorite.repository.interface';
import { FavoriteModel } from '../models/favorite.mongoose.model';

interface FavoriteLeanDocument {
  _id: string;
  customerId: string;
  restaurantId: string;
  productId: string;
  createdAt: Date;
}

function toEntity(doc: FavoriteLeanDocument): IFavorite {
  return {
    id: doc._id,
    customerId: doc.customerId,
    restaurantId: doc.restaurantId,
    productId: doc.productId,
    createdAt: doc.createdAt.toISOString(),
  };
}

export class FavoriteMongooseRepository implements IFavoriteRepository {
  async listByRestaurant(customerId: string, restaurantId: string): Promise<IFavorite[]> {
    const docs = await FavoriteModel.find({ customerId, restaurantId })
      .sort({ createdAt: 1 })
      .lean<FavoriteLeanDocument[]>();
    return docs.map(toEntity);
  }

  /** specs/0023-portabilidade-dados REQ-2 — todos os favoritos do cliente, sem filtro de
   * restaurante. */
  async listByCustomer(customerId: string): Promise<IFavorite[]> {
    const docs = await FavoriteModel.find({ customerId }).sort({ createdAt: 1 }).lean<FavoriteLeanDocument[]>();
    return docs.map(toEntity);
  }

  /** Upsert por `(customerId, productId)` — idempotente mesmo sob double-tap (índice único). */
  async add(customerId: string, restaurantId: string, productId: string): Promise<IFavorite> {
    const doc = await FavoriteModel.findOneAndUpdate(
      { customerId, productId },
      { $setOnInsert: { customerId, restaurantId, productId } },
      { upsert: true, new: true },
    ).lean<FavoriteLeanDocument>();
    return toEntity(doc as FavoriteLeanDocument);
  }

  async remove(customerId: string, productId: string): Promise<void> {
    await FavoriteModel.deleteOne({ customerId, productId });
  }
}
