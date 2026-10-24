import { DEFAULT_SUPPORT_SETTINGS, type ISupportSettingsRepository, type SupportSettings } from '../domain/support-settings';
import { SUPPORT_SETTINGS_SINGLETON_ID, SupportSettingsModel } from './support-settings.mongoose.model';

export class SupportSettingsMongooseRepository implements ISupportSettingsRepository {
  async get(): Promise<SupportSettings> {
    const doc = await SupportSettingsModel.findById(SUPPORT_SETTINGS_SINGLETON_ID).lean();
    if (!doc) return { ...DEFAULT_SUPPORT_SETTINGS };
    return {
      whatsapp: doc.whatsapp,
      commercialWhatsapp: doc.commercialWhatsapp,
      financialWhatsapp: doc.financialWhatsapp,
      email: doc.email,
      businessHours: doc.businessHours,
      trainingPriceCents: doc.trainingPriceCents,
      trainingUnlimitedItems: doc.trainingUnlimitedItems,
      trainingIncludedItems: doc.trainingIncludedItems,
      trainingExtraItemPriceCents: doc.trainingExtraItemPriceCents,
    };
  }

  async update(settings: SupportSettings): Promise<SupportSettings> {
    await SupportSettingsModel.findByIdAndUpdate(
      SUPPORT_SETTINGS_SINGLETON_ID,
      { $set: settings },
      { upsert: true, runValidators: true },
    );
    return settings;
  }
}
