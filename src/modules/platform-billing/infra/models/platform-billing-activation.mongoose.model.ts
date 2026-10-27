import { Schema, model } from 'mongoose';

// specs/0175-cobranca-assinatura-asaas REQ-34 — documento único (mesmo padrão de
// `BillingSettingsModel`/`BILLING_SETTINGS_SINGLETON_ID`): lojas existentes começam a ser
// cobradas pela competência do MÊS DE ATIVAÇÃO desta integração, nunca retroativo. Criado uma
// única vez pela migração (`activatePlatformBilling`) — deploys seguintes nunca o recriam/pisam
// em cima (idempotente: a migração só cria `if (!exists)`).
export const PLATFORM_BILLING_ACTIVATION_SINGLETON_ID = 'singleton';

const platformBillingActivationSchema = new Schema(
  {
    _id: { type: String },
    /** `YYYY-MM`, mesmo formato de `monthKeyOf` (`billing/domain/billing.ts`). */
    activatedMonth: { type: String, required: true },
  },
  { _id: false, timestamps: true },
);

export const PlatformBillingActivationModel = model(
  'PlatformBillingActivation',
  platformBillingActivationSchema,
  'platformBillingActivation',
);
