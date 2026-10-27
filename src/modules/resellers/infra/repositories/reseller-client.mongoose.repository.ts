import { IResellerClient, ResellerClientOrigin } from '../../domain/entities/reseller-client.entity';
import { IResellerClientRepository } from '../../domain/repositories/reseller-client.repository.interface';
import { ResellerClientModel } from '../models/reseller-client.mongoose.model';

interface ResellerClientLeanDocument {
  _id: string;
  resellerId: string;
  restaurantId: string;
  origin: ResellerClientOrigin;
  createdAt: Date;
}

function toEntity(doc: ResellerClientLeanDocument): IResellerClient {
  return { id: doc._id, resellerId: doc.resellerId, restaurantId: doc.restaurantId, origin: doc.origin, createdAt: doc.createdAt };
}

export class ResellerClientMongooseRepository implements IResellerClientRepository {
  async create(input: { resellerId: string; restaurantId: string; origin: ResellerClientOrigin }): Promise<IResellerClient> {
    const doc = await ResellerClientModel.create(input);
    return toEntity(doc.toObject());
  }

  async listByReseller(resellerId: string): Promise<IResellerClient[]> {
    const docs = await ResellerClientModel.find({ resellerId }).sort({ createdAt: -1 }).lean<ResellerClientLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findByRestaurantId(restaurantId: string): Promise<IResellerClient | null> {
    const doc = await ResellerClientModel.findOne({ restaurantId }).lean<ResellerClientLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async listClaimedRestaurantIds(): Promise<Set<string>> {
    const docs = await ResellerClientModel.find().select('restaurantId').lean<{ restaurantId: string }[]>();
    return new Set(docs.map((doc) => doc.restaurantId));
  }

  async countByReseller(resellerId: string): Promise<number> {
    return ResellerClientModel.countDocuments({ resellerId });
  }
}
