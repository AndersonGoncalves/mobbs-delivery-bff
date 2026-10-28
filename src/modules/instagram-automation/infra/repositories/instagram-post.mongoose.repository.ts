import { IInstagramPost } from '../../domain/entities/instagram-post.entity';
import { IInstagramPostRepository } from '../../domain/repositories/instagram-post.repository.interface';
import { InstagramPostModel } from '../models/instagram-post.mongoose.model';

interface InstagramPostLeanDocument {
  _id: string;
  restaurantId: string;
  imageUrl: string;
  caption: string;
  scheduledAt: Date;
  status: 'agendado' | 'publicado' | 'falhou';
  publishedAt?: Date;
  errorMessage?: string;
  createdAt: Date;
}

function toEntity(doc: InstagramPostLeanDocument): IInstagramPost {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    imageUrl: doc.imageUrl,
    caption: doc.caption,
    scheduledAt: doc.scheduledAt.toISOString(),
    status: doc.status,
    publishedAt: doc.publishedAt?.toISOString(),
    errorMessage: doc.errorMessage,
    createdAt: doc.createdAt.toISOString(),
  };
}

export class InstagramPostMongooseRepository implements IInstagramPostRepository {
  async create(input: { restaurantId: string; imageUrl: string; caption: string; scheduledAt: string }): Promise<IInstagramPost> {
    const doc = await InstagramPostModel.create({ ...input, scheduledAt: new Date(input.scheduledAt), status: 'agendado' });
    return toEntity(doc.toObject());
  }

  async findById(id: string): Promise<IInstagramPost | null> {
    const doc = await InstagramPostModel.findById(id).lean<InstagramPostLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async listByRestaurant(restaurantId: string): Promise<IInstagramPost[]> {
    const docs = await InstagramPostModel.find({ restaurantId }).sort({ scheduledAt: -1 }).lean<InstagramPostLeanDocument[]>();
    return docs.map(toEntity);
  }

  async delete(id: string, restaurantId: string): Promise<boolean> {
    const result = await InstagramPostModel.deleteOne({ _id: id, restaurantId, status: 'agendado' });
    return result.deletedCount > 0;
  }

  async listDue(now: Date): Promise<IInstagramPost[]> {
    const docs = await InstagramPostModel.find({ status: 'agendado', scheduledAt: { $lte: now } }).lean<InstagramPostLeanDocument[]>();
    return docs.map(toEntity);
  }

  async markPublished(id: string, publishedAt: string): Promise<void> {
    await InstagramPostModel.updateOne({ _id: id }, { $set: { status: 'publicado', publishedAt: new Date(publishedAt) } });
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await InstagramPostModel.updateOne({ _id: id }, { $set: { status: 'falhou', errorMessage } });
  }
}
