import type { IPlatformConfigRepository } from '../domain/platform-config.repository.interface';
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
}
