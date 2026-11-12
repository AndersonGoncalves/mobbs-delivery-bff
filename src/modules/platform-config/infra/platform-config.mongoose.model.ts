import { Schema, model } from 'mongoose';

/** specs/0201-controle-integracoes-cnpj-plataforma ADR-2 — documento único, mesmo padrão de
 * `LandingContentModel` (`LANDING_CONTENT_SINGLETON_ID`). */
export const PLATFORM_CONFIG_SINGLETON_ID = 'platform-config';

const platformConfigSchema = new Schema(
  {
    _id: { type: String },
    // specs/0209-desacoplar-integracoes-cnpj-plataforma — substitui o antigo `cnpjIntegrationsEnabled`
    // único (specs/0201), que juntava Asaas/Mercado Pago (motivo técnico real: dependem do CNPJ da
    // própria Mobbs homologado) com iFood/99Food (que nunca dependeram disso tecnicamente, só
    // ficavam escondidos pelo mesmo motivo de produto) num switch só. Agora cada integração tem o
    // seu, fail-safe igual (ADR-4): ausência = `false`.
    asaasIntegrationEnabled: { type: Boolean, default: false },
    mercadoPagoIntegrationEnabled: { type: Boolean, default: false },
    ifoodIntegrationEnabled: { type: Boolean, default: false },
    ninetyNineFoodIntegrationEnabled: { type: Boolean, default: false },
    // (ajuste 10/11/2026, pedido explícito do usuário) — mesma mecânica/mesmo documento singleton
    // acima, um switch global por app: libera ou não o KDS, a Comanda e o Autoatendimento (totem)
    // na plataforma inteira. Fail-safe igual: ausência = `false`, o app nasce desligado até alguém
    // rodar o script de ativação (ver scripts/set-platform-config.ts). Diferente de
    // `restaurant.totemEnabled` (por restaurante, specs/0155) — este é platform-wide, acima de
    // qualquer configuração por restaurante.
    kdsAppEnabled: { type: Boolean, default: false },
    comandaAppEnabled: { type: Boolean, default: false },
    totemAppEnabled: { type: Boolean, default: false },
    // (ajuste 11/11/2026, pedido explícito do usuário) — mesma mecânica dos 3 switches acima,
    // libera ou não "Automação Instagram" no menu da retaguarda.
    instagramAutomationEnabled: { type: Boolean, default: false },
    // (ajuste 11/11/2026, pedido explícito do usuário) — carimbo de quando cada switch virou
    // `true` (gravado pelo script de ativação, nunca pelo usuário diretamente), usado só pra
    // calcular a tag "Novo" no menu (10 dias desde a ativação, ver `platform-config.controller.ts`
    // `isNew`). Sem default — ausente = nunca foi ativado. Desligar o switch NÃO limpa o carimbo
    // (não precisa: `isNew` já exige `enabled === true` antes de olhar a data), mas ativar de novo
    // sempre regrava com a data atual — reinicia a contagem dos 10 dias a cada reativação, pedido
    // explícito do usuário.
    asaasIntegrationEnabledAt: { type: Date },
    mercadoPagoIntegrationEnabledAt: { type: Date },
    ifoodIntegrationEnabledAt: { type: Date },
    ninetyNineFoodIntegrationEnabledAt: { type: Date },
    kdsAppEnabledAt: { type: Date },
    comandaAppEnabledAt: { type: Date },
    totemAppEnabledAt: { type: Date },
    instagramAutomationEnabledAt: { type: Date },
  },
  { _id: false, timestamps: true },
);

export const PlatformConfigModel = model('PlatformConfig', platformConfigSchema, 'platformConfig');
