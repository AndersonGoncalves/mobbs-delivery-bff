import {
  emptyLandingContent,
  type ILandingContentRepository,
  type ILandingTestimonialRepository,
  type LandingContent,
  type LandingTestimonial,
  type NewLandingTestimonial,
  type TestimonialStatus,
} from '../domain/landing-content';
import {
  LANDING_CONTENT_SINGLETON_ID,
  LandingContentModel,
  LandingTestimonialModel,
  type LandingTestimonialDocument,
} from './landing-content.mongoose.model';

export class LandingContentMongooseRepository implements ILandingContentRepository {
  async get(): Promise<LandingContent> {
    const doc = await LandingContentModel.findById(LANDING_CONTENT_SINGLETON_ID).lean();
    if (!doc) return emptyLandingContent();
    const empty = emptyLandingContent();
    const stored = doc.settings;
    return {
      features: (doc.features ?? []).map(({ id, text, group }) => ({ id, text, group: group ?? '' })),
      featureGroups: (doc.featureGroups ?? []).map(({ id, name, backgroundColor, imageUrl }) => ({
        id, name, backgroundColor: backgroundColor ?? '', imageUrl: imageUrl ?? '',
      })),
      promoBlocks: (doc.promoBlocks ?? []).map(({ id, title, description, imageUrl, imagePosition, backgroundColor, buttons }) => ({
        id, title, description: description ?? '', imageUrl: imageUrl ?? '', imagePosition: imagePosition ?? 'right', backgroundColor: backgroundColor ?? '',
        buttons: (buttons ?? []).map(({ label, url, icon }) => ({ label, url, icon: icon ?? 'none' })),
      })),
      howItWorks: (doc.howItWorks ?? []).map(({ id, title, description, mediaType, mediaUrl }) => ({ id, title, description, mediaType, mediaUrl })),
      clients: (doc.clients ?? []).map(({ id, companyName, description, imageUrl, linkUrl }) => ({ id, companyName, description, imageUrl, linkUrl: linkUrl ?? '' })),
      faq: (doc.faq ?? []).map(({ id, question, answer }) => ({ id, question, answer })),
      pricingPlans: (doc.pricingPlans ?? []).map(({ id, name, description, billingTier, monthlyPriceCents, annualMonthlyPriceCents, highlighted, features }) => ({
        id, name, description: description ?? '', billingTier: billingTier ?? 'custom', monthlyPriceCents, annualMonthlyPriceCents,
        highlighted: highlighted ?? false, features: features ?? [],
      })),
      company: { ...empty.company, ...(doc.company ?? {}) },
      settings: {
        headerColor: stored?.headerColor ?? '',
        features: { ...empty.settings.features, ...(stored?.features ?? {}) },
        howItWorks: { ...empty.settings.howItWorks, ...(stored?.howItWorks ?? {}) },
        clients: { ...empty.settings.clients, ...(stored?.clients ?? {}) },
        testimonials: { ...empty.settings.testimonials, ...(stored?.testimonials ?? {}) },
        faq: { ...empty.settings.faq, ...(stored?.faq ?? {}) },
        pricing: { ...empty.settings.pricing, ...(stored?.pricing ?? {}) },
      },
    };
  }

  async update(content: LandingContent): Promise<LandingContent> {
    await LandingContentModel.findByIdAndUpdate(
      LANDING_CONTENT_SINGLETON_ID,
      { $set: content },
      { upsert: true, runValidators: true },
    );
    return content;
  }
}

function toEntity(doc: LandingTestimonialDocument): LandingTestimonial {
  return {
    id: doc._id,
    authorName: doc.authorName,
    businessName: doc.businessName,
    city: doc.city ?? '',
    text: doc.text,
    ...(doc.rating ? { rating: doc.rating } : {}),
    status: doc.status,
    createdAt: doc.createdAt,
  };
}

export class LandingTestimonialMongooseRepository implements ILandingTestimonialRepository {
  async create(input: NewLandingTestimonial): Promise<LandingTestimonial> {
    const doc = await LandingTestimonialModel.create(input);
    return toEntity(doc.toObject());
  }

  async list(status?: TestimonialStatus): Promise<LandingTestimonial[]> {
    const docs = await LandingTestimonialModel.find(status ? { status } : {}).sort({ createdAt: -1 }).limit(200).lean();
    return docs.map(toEntity);
  }

  async updateStatus(id: string, status: TestimonialStatus): Promise<LandingTestimonial | null> {
    const doc = await LandingTestimonialModel.findByIdAndUpdate(id, { $set: { status } }, { new: true }).lean();
    return doc ? toEntity(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await LandingTestimonialModel.deleteOne({ _id: id });
    return result.deletedCount > 0;
  }
}
