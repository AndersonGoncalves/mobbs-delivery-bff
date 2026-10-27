import type { BillingSettings } from '../../../billing/domain/billing';

/**
 * specs/0175-cobranca-assinatura-asaas REQ-8 — `BillingSettings` (specs/0113) GANHA vigência:
 * editar a configuração nunca sobrescreve a versão atual, sempre cria uma nova com
 * `effectiveFrom` a partir de agora. Usada pra resolver "qual tabela valia numa competência
 * fechada" (`settingsEffectiveAt`, `billing-calendar.ts`) mesmo quando a emissão é recuperada
 * dias/meses depois — nunca aplica tabela reajustada posteriormente como se fosse a anterior
 * (REQ-8/AC-4). A versão 1 nasce na migração de ativação (REQ-34) a partir do documento único
 * hoje existente (`BillingSettingsModel`).
 */
export interface IBillingSettingsVersion extends BillingSettings {
  id: string;
  effectiveFrom: Date;
  /** E-mail do administrador que editou, ou `'system'` pra versão 1 (migração). */
  createdBy: string;
  createdAt: Date;
}
