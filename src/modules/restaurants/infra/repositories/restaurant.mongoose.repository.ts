import {
  IBusinessHours,
  IRestaurant,
  IRestaurantAddress,
  PixKeyType,
} from '../../domain/entities/restaurant.entity';
import {
  IRestaurantRepository,
  RestaurantProfileUpdate,
} from '../../domain/repositories/restaurant.repository.interface';
import { RestaurantModel } from '../models/restaurant.mongoose.model';

interface RestaurantLeanDocument {
  _id: string;
  name: string;
  slug: string;
  isActive: boolean;
  logoUrl?: string;
  primaryColor?: string;
  businessHours?: IBusinessHours[];
  address?: IRestaurantAddress;
  phone?: string;
  minimumOrderValue?: number;
  welcomeMessage?: string;
  orderConfirmationGreeting?: string;
  pixKey?: string;
  pixKeyType?: PixKeyType;
  pixBeneficiaryName?: string;
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
    address: doc.address,
    phone: doc.phone,
    minimumOrderValue: doc.minimumOrderValue ?? 0,
    welcomeMessage: doc.welcomeMessage,
    orderConfirmationGreeting: doc.orderConfirmationGreeting,
    pixKey: doc.pixKey,
    pixKeyType: doc.pixKeyType,
    pixBeneficiaryName: doc.pixBeneficiaryName,
  };
}

export class RestaurantMongooseRepository implements IRestaurantRepository {
  async findBySlug(slug: string): Promise<IRestaurant | null> {
    const doc = await RestaurantModel.findOne({ slug }).lean<RestaurantLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findById(id: string): Promise<IRestaurant | null> {
    const doc = await RestaurantModel.findById(id).lean<RestaurantLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async updateProfile(id: string, patch: RestaurantProfileUpdate): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async updateBusinessHours(id: string, businessHours: IBusinessHours[]): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(
      id,
      { $set: { businessHours } },
      { new: true },
    ).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async setActive(id: string, isActive: boolean): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: { isActive } }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }

  async updateSlug(id: string, slug: string): Promise<IRestaurant> {
    const doc = await RestaurantModel.findByIdAndUpdate(id, { $set: { slug } }, { new: true }).lean<RestaurantLeanDocument>();
    return toEntity(doc as RestaurantLeanDocument);
  }
}
