import { IPromotion } from '../../domain/entities/promotion.entity';
import { IPromotionRepository, PromotionInput } from '../../domain/repositories/promotion.repository.interface';
import { PromotionModel } from '../models/promotion.mongoose.model';

interface PromotionLeanDocument {
  _id: string;
  restaurantId: string;
  name: string;
  discountPercentage: number;
  productIds: string[];
  isActive: boolean;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
}

function toEntity(doc: PromotionLeanDocument): IPromotion {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    name: doc.name,
    discountPercentage: doc.discountPercentage,
    productIds: doc.productIds,
    isActive: doc.isActive,
    startDate: doc.startDate.toISOString(),
    endDate: doc.endDate.toISOString(),
    createdAt: doc.createdAt.toISOString(),
  };
}

function toSetPayload(input: PromotionInput) {
  return {
    name: input.name,
    discountPercentage: input.discountPercentage,
    productIds: input.productIds,
    isActive: input.isActive,
    startDate: new Date(input.startDate),
    endDate: new Date(input.endDate),
  };
}

export class PromotionMongooseRepository implements IPromotionRepository {
  async findByRestaurantId(restaurantId: string): Promise<IPromotion[]> {
    const docs = await PromotionModel.find({ restaurantId }).sort({ createdAt: -1 }).lean<PromotionLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findActiveByRestaurantId(restaurantId: string): Promise<IPromotion[]> {
    const docs = await PromotionModel.find({ restaurantId, isActive: true }).lean<PromotionLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findById(id: string): Promise<IPromotion | null> {
    const doc = await PromotionModel.findById(id).lean<PromotionLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async create(restaurantId: string, input: PromotionInput): Promise<IPromotion> {
    const doc = await PromotionModel.create({ restaurantId, ...toSetPayload(input) });
    return toEntity(doc.toObject() as PromotionLeanDocument);
  }

  async update(id: string, input: PromotionInput): Promise<IPromotion> {
    const doc = await PromotionModel.findByIdAndUpdate(id, { $set: toSetPayload(input) }, { new: true }).lean<PromotionLeanDocument>();
    return toEntity(doc as PromotionLeanDocument);
  }

  async setActive(id: string, isActive: boolean): Promise<IPromotion> {
    const doc = await PromotionModel.findByIdAndUpdate(id, { $set: { isActive } }, { new: true }).lean<PromotionLeanDocument>();
    return toEntity(doc as PromotionLeanDocument);
  }
}
