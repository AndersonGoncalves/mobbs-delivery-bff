import { ISuggestionRepository, Suggestion, SuggestionFilter, SuggestionUpdate } from '../domain/suggestion';
import { SuggestionDocument, SuggestionModel, SuggestionReadModel } from './suggestion.model';

function toEntity(doc: SuggestionDocument): Suggestion {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    restaurantName: doc.restaurantName,
    authorEmail: doc.authorEmail,
    title: doc.title,
    description: doc.description,
    status: doc.status,
    revision: doc.revision,
    updates: doc.updates,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class SuggestionRepository implements ISuggestionRepository {
  async create(input: Parameters<ISuggestionRepository['create']>[0]): Promise<Suggestion> {
    const doc = await SuggestionModel.create(input);
    return toEntity(doc.toObject());
  }

  async list(filter: SuggestionFilter) {
    const query = {
      ...(filter.restaurantId ? { restaurantId: filter.restaurantId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };
    const [docs, total] = await Promise.all([
      SuggestionModel.find(query).sort({ createdAt: -1, _id: -1 })
        .skip((filter.page - 1) * filter.pageSize).limit(filter.pageSize).lean(),
      SuggestionModel.countDocuments(query),
    ]);
    const reads = filter.operatorId
      ? await SuggestionReadModel.find({ operatorId: filter.operatorId, suggestionId: { $in: docs.map((doc) => doc._id) } }).lean()
      : [];
    const revisions = new Map(reads.map((read) => [read.suggestionId, read.revision]));
    return {
      items: docs.map((doc) => ({
        ...toEntity(doc),
        ...(filter.operatorId ? { unread: doc.revision > (revisions.get(doc._id) ?? 0) } : {}),
      })),
      total,
    };
  }

  async findById(id: string, restaurantId?: string): Promise<Suggestion | null> {
    const doc = await SuggestionModel.findOne({ _id: id, ...(restaurantId ? { restaurantId } : {}) }).lean();
    return doc ? toEntity(doc) : null;
  }

  async update(id: string, revision: number, update: SuggestionUpdate): Promise<Suggestion | null> {
    const doc = await SuggestionModel.findOneAndUpdate(
      { _id: id, revision },
      { $set: { status: update.status }, $inc: { revision: 1 }, $push: { updates: update } },
      { new: true },
    ).lean();
    return doc ? toEntity(doc) : null;
  }

  async markRead(id: string, operatorId: string, revision: number): Promise<void> {
    await SuggestionReadModel.updateOne(
      { suggestionId: id, operatorId },
      { $max: { revision } },
      { upsert: true },
    );
  }

  async unreadCount(restaurantId: string, operatorId: string): Promise<number> {
    const result = await SuggestionModel.aggregate<{ count: number }>([
      { $match: { restaurantId, revision: { $gt: 0 } } },
      { $lookup: {
        from: SuggestionReadModel.collection.name,
        let: { suggestionId: '$_id' },
        pipeline: [{ $match: { $expr: { $and: [
          { $eq: ['$suggestionId', '$$suggestionId'] },
          { $eq: ['$operatorId', { $literal: operatorId }] },
        ] } } }],
        as: 'reads',
      } },
      { $match: { $expr: { $gt: ['$revision', { $ifNull: [{ $arrayElemAt: ['$reads.revision', 0] }, 0] }] } } },
      { $count: 'count' },
    ]);
    return result[0]?.count ?? 0;
  }
}
