import type { IPlatformConfigRepository, PlatformConfigSnapshot } from '../domain/platform-config.repository.interface';
import { PLATFORM_CONFIG_SINGLETON_ID, PlatformConfigModel } from './platform-config.mongoose.model';

export class PlatformConfigMongooseRepository implements IPlatformConfigRepository {
  async isCnpjIntegrationsEnabled(): Promise<boolean> {
    const doc = await PlatformConfigModel.findById(PLATFORM_CONFIG_SINGLETON_ID).lean();
    return doc?.cnpjIntegrationsEnabled ?? false;
  }

  async isKdsAppEnabled(): Promise<boolean> {
    const doc = await PlatformConfigModel.findById(PLATFORM_CONFIG_SINGLETON_ID).lean();
    return doc?.kdsAppEnabled ?? false;
  }

  async isComandaAppEnabled(): Promise<boolean> {
    const doc = await PlatformConfigModel.findById(PLATFORM_CONFIG_SINGLETON_ID).lean();
    return doc?.comandaAppEnabled ?? false;
  }

  async isTotemAppEnabled(): Promise<boolean> {
    const doc = await PlatformConfigModel.findById(PLATFORM_CONFIG_SINGLETON_ID).lean();
    return doc?.totemAppEnabled ?? false;
  }

  async isInstagramAutomationEnabled(): Promise<boolean> {
    const doc = await PlatformConfigModel.findById(PLATFORM_CONFIG_SINGLETON_ID).lean();
    return doc?.instagramAutomationEnabled ?? false;
  }

  async getSnapshot(): Promise<PlatformConfigSnapshot> {
    const doc = await PlatformConfigModel.findById(PLATFORM_CONFIG_SINGLETON_ID).lean();
    return {
      cnpjIntegrationsEnabled: doc?.cnpjIntegrationsEnabled ?? false,
      cnpjIntegrationsEnabledAt: doc?.cnpjIntegrationsEnabledAt,
      kdsAppEnabled: doc?.kdsAppEnabled ?? false,
      kdsAppEnabledAt: doc?.kdsAppEnabledAt,
      comandaAppEnabled: doc?.comandaAppEnabled ?? false,
      comandaAppEnabledAt: doc?.comandaAppEnabledAt,
      totemAppEnabled: doc?.totemAppEnabled ?? false,
      totemAppEnabledAt: doc?.totemAppEnabledAt,
      instagramAutomationEnabled: doc?.instagramAutomationEnabled ?? false,
      instagramAutomationEnabledAt: doc?.instagramAutomationEnabledAt,
    };
  }
}
