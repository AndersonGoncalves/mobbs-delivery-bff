import { Schema, model } from 'mongoose';

/** specs/0201-controle-integracoes-cnpj-plataforma ADR-2 — documento único, mesmo padrão de
 * `LandingContentModel` (`LANDING_CONTENT_SINGLETON_ID`). */
export const PLATFORM_CONFIG_SINGLETON_ID = 'platform-config';

const platformConfigSchema = new Schema(
  {
    _id: { type: String },
    // Fail-safe (ADR-4): ausência do documento ou do campo = `false` — o app lança sem CNPJ.
    cnpjIntegrationsEnabled: { type: Boolean, default: false },
  },
  { _id: false, timestamps: true },
);

export const PlatformConfigModel = model('PlatformConfig', platformConfigSchema, 'platformConfig');
