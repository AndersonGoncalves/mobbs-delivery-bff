import { monthKeyOf, monthRange } from '../../../billing/domain/billing';
import type { IBillingSettingsRepository } from '../../../billing/domain/repositories/billing-settings.repository.interface';
import type { IBillingSettingsVersionRepository } from '../../domain/repositories/billing-settings-version.repository.interface';
import type { IPlatformBillingActivationRepository } from '../../domain/repositories/platform-billing-activation.repository.interface';

/**
 * specs/0175-cobranca-assinatura-asaas REQ-34/AC-25 — ativação da cobrança da assinatura.
 * Idempotente (roda em TODO startup do BFF, mesmo padrão de `backfillStockTracking` etc.):
 *
 * 1. Cria o piso de competência (`PlatformBillingActivation.activatedMonth`) na PRIMEIRA vez que
 *    rodar — lojas existentes só são cobradas a partir deste mês, nunca retroativo. Deploys
 *    seguintes NUNCA pisam em cima (reutiliza o mês já gravado).
 * 2. Cria a `IBillingSettingsVersion` versão 1, a partir do `BillingSettings` (documento único,
 *    specs/0113) corrente no momento da ativação, com `effectiveFrom` = início do mês de
 *    ativação — só se ainda não existir NENHUMA versão (nunca cria uma segunda).
 *
 * Restaurante com `billing.cycle === 'annual'` legado (anterior a esta spec) sem
 * `IAnnualSubscription` correspondente NUNCA é convertido automaticamente aqui — aparece como
 * pendência computada na listagem administrativa (`PlatformController.buildBillingRow`,
 * `hasLegacyAnnualConflict`), nunca inventada por esta migração.
 */
export async function activatePlatformBilling(deps: {
  activationRepository: IPlatformBillingActivationRepository;
  settingsVersionRepository: IBillingSettingsVersionRepository;
  billingSettingsRepository: IBillingSettingsRepository;
}): Promise<void> {
  const existingActivation = await deps.activationRepository.get();
  const activatedMonth = existingActivation?.activatedMonth ?? monthKeyOf(new Date());
  await deps.activationRepository.createIfAbsent(activatedMonth);

  const versions = await deps.settingsVersionRepository.listAll();
  if (versions.length === 0) {
    const currentSettings = await deps.billingSettingsRepository.get();
    const { start } = monthRange(activatedMonth);
    await deps.settingsVersionRepository.create(currentSettings, start, 'system');
  }
}
