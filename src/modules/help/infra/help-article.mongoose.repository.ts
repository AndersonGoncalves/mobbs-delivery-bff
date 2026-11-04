import type { HelpArticle, HelpAudience, IHelpArticleRepository, NewHelpArticle } from '../domain/help-article';
import { HelpArticleModel, type HelpArticleDocument } from './help-article.mongoose.model';

function toEntity(doc: HelpArticleDocument): HelpArticle {
  return {
    id: doc._id,
    audience: doc.audience,
    moduleKey: doc.moduleKey,
    moduleLabel: doc.moduleLabel,
    moduleOrder: doc.moduleOrder,
    itemLabel: doc.itemLabel,
    itemOrder: doc.itemOrder,
    linkTo: doc.linkTo,
    title: doc.title,
    steps: (doc.steps ?? []).map(({ text, imageUrl }) => ({ text, ...(imageUrl ? { imageUrl } : {}) })),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class HelpArticleMongooseRepository implements IHelpArticleRepository {
  async list(audience: HelpAudience): Promise<HelpArticle[]> {
    const docs = await HelpArticleModel.find({ audience }).sort({ moduleOrder: 1, itemOrder: 1 }).lean();
    return docs.map(toEntity);
  }

  async findById(id: string): Promise<HelpArticle | null> {
    const doc = await HelpArticleModel.findById(id).lean();
    return doc ? toEntity(doc) : null;
  }

  async create(input: NewHelpArticle): Promise<HelpArticle> {
    const doc = await HelpArticleModel.create(input);
    return toEntity(doc.toObject());
  }

  async update(id: string, input: NewHelpArticle): Promise<HelpArticle | null> {
    const doc = await HelpArticleModel.findByIdAndUpdate(id, { $set: input }, { new: true }).lean();
    return doc ? toEntity(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await HelpArticleModel.deleteOne({ _id: id });
    return result.deletedCount > 0;
  }
}
