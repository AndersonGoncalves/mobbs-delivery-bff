import { IRestaurantOperator } from '../../domain/entities/restaurant-operator.entity';
import { IRestaurantOperatorRepository } from '../../domain/repositories/restaurant-operator.repository.interface';
import { RestaurantOperatorModel } from '../models/restaurant-operator.mongoose.model';

interface RestaurantOperatorLeanDocument {
  _id: string;
  restaurantId: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
}

function toEntity(doc: RestaurantOperatorLeanDocument): IRestaurantOperator {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    email: doc.email,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
  };
}

export class RestaurantOperatorMongooseRepository implements IRestaurantOperatorRepository {
  async findActiveOperatorByEmail(email: string): Promise<IRestaurantOperator | null> {
    const doc = await RestaurantOperatorModel.findOne({ email, isActive: true }).lean<RestaurantOperatorLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async listByRestaurant(restaurantId: string): Promise<IRestaurantOperator[]> {
    const docs = await RestaurantOperatorModel.find({ restaurantId }).lean<RestaurantOperatorLeanDocument[]>();
    return docs.map(toEntity);
  }

  async countActiveByRestaurant(restaurantId: string): Promise<number> {
    return RestaurantOperatorModel.countDocuments({ restaurantId, isActive: true });
  }

  async create(restaurantId: string, email: string): Promise<IRestaurantOperator> {
    const doc = await RestaurantOperatorModel.create({ restaurantId, email });
    return toEntity(doc.toObject());
  }

  async deactivate(id: string): Promise<void> {
    await RestaurantOperatorModel.findByIdAndUpdate(id, { $set: { isActive: false } });
  }

  async findById(id: string): Promise<IRestaurantOperator | null> {
    const doc = await RestaurantOperatorModel.findById(id).lean<RestaurantOperatorLeanDocument>();
    return doc ? toEntity(doc) : null;
  }
}
