import { IReferral } from '../../domain/entities/referral.entity';
import { IReferralRepository } from '../../domain/repositories/referral.repository.interface';
import { ReferralModel } from '../models/referral.mongoose.model';

interface ReferralLeanDocument {
  _id: string;
  referrerRestaurantId: string;
  referredRestaurantId: string;
  rewardCents: number;
  createdAt: Date;
}

function toEntity(doc: ReferralLeanDocument): IReferral {
  return {
    id: doc._id,
    referrerRestaurantId: doc.referrerRestaurantId,
    referredRestaurantId: doc.referredRestaurantId,
    rewardCents: doc.rewardCents,
    createdAt: doc.createdAt,
  };
}

export class ReferralMongooseRepository implements IReferralRepository {
  async create(input: { referrerRestaurantId: string; referredRestaurantId: string; rewardCents: number }): Promise<IReferral> {
    const doc = await ReferralModel.create(input);
    return toEntity(doc.toObject());
  }

  async findByReferrerRestaurantId(restaurantId: string): Promise<IReferral[]> {
    const docs = await ReferralModel.find({ referrerRestaurantId: restaurantId }).sort({ createdAt: -1 }).lean<ReferralLeanDocument[]>();
    return docs.map(toEntity);
  }

  async getBalanceCents(restaurantId: string): Promise<number> {
    const [result] = await ReferralModel.aggregate<{ total: number }>([
      { $match: { referrerRestaurantId: restaurantId } },
      { $group: { _id: null, total: { $sum: '$rewardCents' } } },
    ]);
    return result?.total ?? 0;
  }
}
