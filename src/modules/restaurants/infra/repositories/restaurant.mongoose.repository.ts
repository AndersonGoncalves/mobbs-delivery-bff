import { IBusinessHours, IRestaurant } from '../../domain/entities/restaurant.entity';
import { IRestaurantRepository } from '../../domain/repositories/restaurant.repository.interface';
import { RestaurantModel } from '../models/restaurant.mongoose.model';

interface RestaurantLeanDocument {
  _id: string;
  name: string;
  slug: string;
  isActive: boolean;
  logoUrl?: string;
  primaryColor?: string;
  businessHours?: IBusinessHours[];
}

function toEntity(doc: RestaurantLeanDocument): IRestaurant {
  return {
    id: doc._id,
    name: doc.name,
    slug: doc.slug,
    isActive: doc.isActive,
    logoUrl: doc.logoUrl,
    primaryColor: doc.primaryColor,
    businessHours: doc.businessHours ?? [],
  };
}

export class RestaurantMongooseRepository implements IRestaurantRepository {
  async findBySlug(slug: string): Promise<IRestaurant | null> {
    const doc = await RestaurantModel.findOne({ slug }).lean<RestaurantLeanDocument>();
    return doc ? toEntity(doc) : null;
  }
}
