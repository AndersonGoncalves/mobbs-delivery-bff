import type { BillingSettings } from '../../../billing/domain/billing';
import type { IBillingSettingsVersion } from '../entities/billing-settings-version.entity';

export interface IBillingSettingsVersionRepository {
  listAll(): Promise<IBillingSettingsVersion[]>;
  create(settings: BillingSettings, effectiveFrom: Date, createdBy: string): Promise<IBillingSettingsVersion>;
  /** A versão vigente numa data — a mais recente com `effectiveFrom <= date`. `null` só se nunca
   * houver versão nenhuma (nunca deveria acontecer depois da migração de ativação, T028). */
  currentAt(date: Date): Promise<IBillingSettingsVersion | null>;
}
