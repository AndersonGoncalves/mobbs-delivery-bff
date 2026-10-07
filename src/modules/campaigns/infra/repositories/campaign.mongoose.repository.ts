import { ICampaign } from '../../domain/entities/campaign.entity';
import { CampaignInput, ICampaignRepository } from '../../domain/repositories/campaign.repository.interface';
import { CampaignModel } from '../models/campaign.mongoose.model';

interface CampaignLeanDocument {
  _id: string;
  restaurantId: string;
  message: string;
  imageUrl?: string;
  campaignCode: string;
  status: 'sending' | 'completed';
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  completedAt?: Date;
  createdAt: Date;
}

function toEntity(doc: CampaignLeanDocument): ICampaign {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    message: doc.message,
    imageUrl: doc.imageUrl,
    campaignCode: doc.campaignCode,
    status: doc.status,
    totalRecipients: doc.totalRecipients,
    sentCount: doc.sentCount,
    failedCount: doc.failedCount,
    createdAt: doc.createdAt.toISOString(),
    completedAt: doc.completedAt?.toISOString(),
  };
}

export class CampaignMongooseRepository implements ICampaignRepository {
  async create(restaurantId: string, input: CampaignInput): Promise<ICampaign> {
    const doc = await CampaignModel.create({
      restaurantId,
      message: input.message,
      imageUrl: input.imageUrl,
      campaignCode: input.campaignCode,
      status: 'sending',
      totalRecipients: 0,
      sentCount: 0,
      failedCount: 0,
    });
    return toEntity(doc.toObject() as CampaignLeanDocument);
  }

  async findById(id: string): Promise<ICampaign | null> {
    const doc = await CampaignModel.findById(id).lean<CampaignLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findManyByRestaurant(restaurantId: string): Promise<ICampaign[]> {
    const docs = await CampaignModel.find({ restaurantId }).sort({ createdAt: -1 }).lean<CampaignLeanDocument[]>();
    return docs.map(toEntity);
  }

  async setTotalRecipients(id: string, totalRecipients: number): Promise<void> {
    await CampaignModel.updateOne({ _id: id }, { $set: { totalRecipients } });
  }

  async incrementCounts(id: string, delta: { sent?: number; failed?: number }): Promise<void> {
    const inc: Record<string, number> = {};
    if (delta.sent) inc.sentCount = delta.sent;
    if (delta.failed) inc.failedCount = delta.failed;
    if (Object.keys(inc).length === 0) return;
    await CampaignModel.updateOne({ _id: id }, { $inc: inc });
  }

  async markCompleted(id: string): Promise<void> {
    await CampaignModel.updateOne({ _id: id }, { $set: { status: 'completed', completedAt: new Date() } });
  }
}
