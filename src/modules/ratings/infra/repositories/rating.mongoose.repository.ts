import { IRating } from '../../domain/entities/rating.entity';
import { IRatingRepository, RatingPage, RatingStats, UpsertRatingInput } from '../../domain/repositories/rating.repository.interface';
import { RatingModel } from '../models/rating.mongoose.model';

interface RatingLeanDocument {
  _id: string;
  restaurantId: string;
  customerId: string;
  score: number;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

function toEntity(doc: RatingLeanDocument): IRating {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    customerId: doc.customerId,
    score: doc.score,
    comment: doc.comment,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class RatingMongooseRepository implements IRatingRepository {
  async upsert(input: UpsertRatingInput): Promise<IRating> {
    const doc = await RatingModel.findOneAndUpdate(
      { restaurantId: input.restaurantId, customerId: input.customerId },
      { $set: { score: input.score, comment: input.comment } },
      { upsert: true, new: true },
    ).lean<RatingLeanDocument>();
    return toEntity(doc!);
  }

  async findManyByRestaurant(restaurantId: string, page: number, pageSize: number): Promise<RatingPage> {
    const [docs, total] = await Promise.all([
      RatingModel.find({ restaurantId })
        .sort({ updatedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean<RatingLeanDocument[]>(),
      RatingModel.countDocuments({ restaurantId }),
    ]);
    return { items: docs.map(toEntity), total };
  }

  async getStats(restaurantId: string): Promise<RatingStats> {
    const [result] = await RatingModel.aggregate<{ average: number; count: number }>([
      { $match: { restaurantId } },
      { $group: { _id: null, average: { $avg: '$score' }, count: { $sum: 1 } } },
    ]);
    if (!result) return { average: 0, count: 0 };
    return { average: Math.round(result.average * 10) / 10, count: result.count };
  }
}
