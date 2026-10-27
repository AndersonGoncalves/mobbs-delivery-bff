import type { IPlatformBillingActivationRepository } from '../../domain/repositories/platform-billing-activation.repository.interface';
import { PLATFORM_BILLING_ACTIVATION_SINGLETON_ID, PlatformBillingActivationModel } from '../models/platform-billing-activation.mongoose.model';

export class PlatformBillingActivationMongooseRepository implements IPlatformBillingActivationRepository {
  async get(): Promise<{ activatedMonth: string } | null> {
    const doc = await PlatformBillingActivationModel.findById(PLATFORM_BILLING_ACTIVATION_SINGLETON_ID).lean<{ activatedMonth: string }>();
    return doc ? { activatedMonth: doc.activatedMonth } : null;
  }

  async createIfAbsent(activatedMonth: string): Promise<{ activatedMonth: string }> {
    const doc = await PlatformBillingActivationModel.findOneAndUpdate(
      { _id: PLATFORM_BILLING_ACTIVATION_SINGLETON_ID },
      { $setOnInsert: { _id: PLATFORM_BILLING_ACTIVATION_SINGLETON_ID, activatedMonth } },
      { upsert: true, new: true },
    ).lean<{ activatedMonth: string }>();
    return { activatedMonth: (doc as { activatedMonth: string }).activatedMonth };
  }
}
