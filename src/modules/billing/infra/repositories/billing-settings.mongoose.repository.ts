import type { BillingSettings } from '../../domain/billing';
import { DEFAULT_BILLING_SETTINGS } from '../../domain/billing';
import type { IBillingSettingsRepository } from '../../domain/repositories/billing-settings.repository.interface';
import { BILLING_SETTINGS_SINGLETON_ID, BillingSettingsModel } from '../models/billing-settings.mongoose.model';

/** specs/0113-parametrizacao-faixas-cobranca — ver a interface pro contrato (AC-1: default sem configuração). */
export class BillingSettingsMongooseRepository implements IBillingSettingsRepository {
  async get(): Promise<BillingSettings> {
    const doc = await BillingSettingsModel.findById(BILLING_SETTINGS_SINGLETON_ID).lean();
    if (!doc) return DEFAULT_BILLING_SETTINGS;
    return {
      freeLimitCents: doc.freeLimitCents,
      proLimitCents: doc.proLimitCents,
      proMonthlyPriceCents: doc.proMonthlyPriceCents,
      premiumMonthlyPriceCents: doc.premiumMonthlyPriceCents,
      annualMultiplier: doc.annualMultiplier,
    };
  }

  async update(settings: BillingSettings): Promise<BillingSettings> {
    await BillingSettingsModel.findByIdAndUpdate(BILLING_SETTINGS_SINGLETON_ID, { _id: BILLING_SETTINGS_SINGLETON_ID, ...settings }, { upsert: true, new: true });
    return settings;
  }
}
