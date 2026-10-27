import type { BillingSettings } from '../../../billing/domain/billing';
import type { IBillingSettingsVersion } from '../../domain/entities/billing-settings-version.entity';
import type { IBillingSettingsVersionRepository } from '../../domain/repositories/billing-settings-version.repository.interface';
import { settingsEffectiveAt } from '../../domain/billing-calendar';
import { BillingSettingsVersionModel } from '../models/billing-settings-version.mongoose.model';

interface BillingSettingsVersionLeanDocument extends BillingSettings {
  _id: string;
  effectiveFrom: Date;
  createdBy: string;
  createdAt: Date;
}

function toEntity(doc: BillingSettingsVersionLeanDocument): IBillingSettingsVersion {
  return {
    id: doc._id,
    freeLimitCents: doc.freeLimitCents,
    proLimitCents: doc.proLimitCents,
    proMonthlyPriceCents: doc.proMonthlyPriceCents,
    premiumMonthlyPriceCents: doc.premiumMonthlyPriceCents,
    annualMultiplier: doc.annualMultiplier,
    effectiveFrom: doc.effectiveFrom,
    createdBy: doc.createdBy,
    createdAt: doc.createdAt,
  };
}

export class BillingSettingsVersionMongooseRepository implements IBillingSettingsVersionRepository {
  async listAll(): Promise<IBillingSettingsVersion[]> {
    const docs = await BillingSettingsVersionModel.find().sort({ effectiveFrom: 1 }).lean<BillingSettingsVersionLeanDocument[]>();
    return docs.map(toEntity);
  }

  async create(settings: BillingSettings, effectiveFrom: Date, createdBy: string): Promise<IBillingSettingsVersion> {
    const doc = await BillingSettingsVersionModel.create({ ...settings, effectiveFrom, createdBy });
    return toEntity(doc.toObject() as BillingSettingsVersionLeanDocument);
  }

  async currentAt(date: Date): Promise<IBillingSettingsVersion | null> {
    // Poucas versões esperadas no total (edição administrativa é rara) — resolver em memória via
    // `settingsEffectiveAt` evita duplicar a lógica de "mais recente <= date" numa query Mongo.
    const versions = await this.listAll();
    return settingsEffectiveAt(date, versions);
  }
}
