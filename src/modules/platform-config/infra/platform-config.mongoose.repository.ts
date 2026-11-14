import type { IPlatformConfigRepository, PlatformConfigSnapshot } from '../domain/platform-config.repository.interface';
import { PLATFORM_CONFIG_SINGLETON_ID, PlatformConfigModel } from './platform-config.mongoose.model';

export class PlatformConfigMongooseRepository implements IPlatformConfigRepository {
  async isAsaasIntegrationEnabled(): Promise<boolean> {
    const doc = await PlatformConfigModel.findById(PLATFORM_CONFIG_SINGLETON_ID).lean();
    return doc?.asaasIntegrationEnabled ?? false;
  }

  async isMercadoPagoIntegrationEnabled(): Promise<boolean> {
    const doc = await PlatformConfigModel.findById(PLATFORM_CONFIG_SINGLETON_ID).lean();
    return doc?.mercadoPagoIntegrationEnabled ?? false;
  }

  async isIfoodIntegrationEnabled(): Promise<boolean> {
    const doc = await PlatformConfigModel.findById(PLATFORM_CONFIG_SINGLETON_ID).lean();
    return doc?.ifoodIntegrationEnabled ?? false;
  }

  async isNinetyNineFoodIntegrationEnabled(): Promise<boolean> {
    const doc = await PlatformConfigModel.findById(PLATFORM_CONFIG_SINGLETON_ID).lean();
    return doc?.ninetyNineFoodIntegrationEnabled ?? false;
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
      asaasIntegrationEnabled: doc?.asaasIntegrationEnabled ?? false,
      asaasIntegrationEnabledAt: doc?.asaasIntegrationEnabledAt,
      mercadoPagoIntegrationEnabled: doc?.mercadoPagoIntegrationEnabled ?? false,
      mercadoPagoIntegrationEnabledAt: doc?.mercadoPagoIntegrationEnabledAt,
      ifoodIntegrationEnabled: doc?.ifoodIntegrationEnabled ?? false,
      ifoodIntegrationEnabledAt: doc?.ifoodIntegrationEnabledAt,
      ninetyNineFoodIntegrationEnabled: doc?.ninetyNineFoodIntegrationEnabled ?? false,
      ninetyNineFoodIntegrationEnabledAt: doc?.ninetyNineFoodIntegrationEnabledAt,
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
