import { Schema, model } from 'mongoose';

/** specs/0201-controle-integracoes-cnpj-plataforma ADR-2 — documento único, mesmo padrão de
 * `LandingContentModel` (`LANDING_CONTENT_SINGLETON_ID`). */
export const PLATFORM_CONFIG_SINGLETON_ID = 'platform-config';

const platformConfigSchema = new Schema(
  {
    _id: { type: String },
    // Fail-safe (ADR-4): ausência do documento ou do campo = `false` — o app lança sem CNPJ.
    cnpjIntegrationsEnabled: { type: Boolean, default: false },
    // (ajuste 10/11/2026, pedido explícito do usuário) — mesma mecânica/mesmo documento singleton
    // de `cnpjIntegrationsEnabled`, um switch global por app: libera ou não o KDS, a Comanda e o
    // Autoatendimento (totem) na plataforma inteira. Fail-safe igual: ausência = `false`, o app
    // nasce desligado até alguém rodar o script de ativação (ver scripts/set-platform-config.ts).
    // Diferente de `restaurant.totemEnabled` (por restaurante, specs/0155) — este é platform-wide,
    // acima de qualquer configuração por restaurante.
    kdsAppEnabled: { type: Boolean, default: false },
    comandaAppEnabled: { type: Boolean, default: false },
    totemAppEnabled: { type: Boolean, default: false },
  },
  { _id: false, timestamps: true },
);

export const PlatformConfigModel = model('PlatformConfig', platformConfigSchema, 'platformConfig');
