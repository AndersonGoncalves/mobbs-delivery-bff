import type { IPlatformConfigRepository } from '../domain/platform-config.repository.interface';
import { PLATFORM_CONFIG_SINGLETON_ID, PlatformConfigModel } from './platform-config.mongoose.model';

export class PlatformConfigMongooseRepository implements IPlatformConfigRepository {
  async isCnpjIntegrationsEnabled(): Promise<boolean> {
    const doc = await PlatformConfigModel.findById(PLATFORM_CONFIG_SINGLETON_ID).lean();
    return doc?.cnpjIntegrationsEnabled ?? false;
  }
}
