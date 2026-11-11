/**
 * specs/0201-controle-integracoes-cnpj-plataforma ADR-2 — liga/desliga um dos switches globais
 * (platform-wide, não por restaurante) no documento singleton `platformConfig`. A escrita é
 * sempre um script pontual rodado pelo usuário, nunca um endpoint de API (ADR-2) — leitura é
 * pública via `GET /platform/config`.
 *
 * Switches disponíveis (todos nascem `false` — fail-safe, ADR-4):
 *   cnpjIntegrationsEnabled      Asaas (subconta), Mercado Pago e Cartão de Crédito Online
 *   kdsAppEnabled                app KDS (mobbs-delivery-kds)
 *   comandaAppEnabled            app Comanda (mobbs-delivery-comanda)
 *   totemAppEnabled              app Totem/Autoatendimento (mobbs-delivery-totem) — platform-wide,
 *                                não confundir com `restaurant.totemEnabled` (por restaurante)
 *   instagramAutomationEnabled   item "Automação Instagram" no menu da retaguarda
 *
 * Uso:
 *   npm run set:platform-config -- --key=cnpjIntegrationsEnabled --value=true
 *   npm run set:platform-config -- --key=kdsAppEnabled --value=false
 *
 * Atalhos de ativação (equivalentes, um por switch — ver package.json):
 *   npm run activate:cnpj-integrations
 *   npm run activate:kds-app
 *   npm run activate:comanda-app
 *   npm run activate:totem-app
 *   npm run activate:instagram-automation
 *
 * Ativar (--value=true) também carimba `<key>At` com a data/hora atual — usado só pra calcular a
 * tag "Novo" no menu (10 dias desde a ativação, `isNew` em `platform-config.controller.ts`).
 * Reativar um switch já ligado antes (desligar e ligar de novo) regrava o carimbo com a data
 * atual, reiniciando a contagem — pedido explícito do usuário (11/11/2026).
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { PLATFORM_CONFIG_SINGLETON_ID, PlatformConfigModel } from '../src/modules/platform-config/infra/platform-config.mongoose.model';

const VALID_KEYS = ['cnpjIntegrationsEnabled', 'kdsAppEnabled', 'comandaAppEnabled', 'totemAppEnabled', 'instagramAutomationEnabled'] as const;
type ConfigKey = (typeof VALID_KEYS)[number];

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([a-zA-Z]+)=(.+)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { key, value } = args;

  if (!key || !VALID_KEYS.includes(key as ConfigKey)) {
    console.error(`Uso: --key=<${VALID_KEYS.join('|')}> --value=true|false`);
    process.exit(1);
  }
  if (value !== 'true' && value !== 'false') {
    console.error('--value precisa ser "true" ou "false".');
    process.exit(1);
  }

  const dbUrl = process.env.DB_URL ?? 'mongodb://localhost:27017/mobbs-delivery';
  await mongoose.connect(dbUrl);
  try {
    const nextValue = value === 'true';
    const update: Record<string, unknown> = { [key]: nextValue };
    // Carimba a data só ao ATIVAR (nunca ao desligar) — reativar depois regrava com a data atual,
    // reiniciando os 10 dias da tag "Novo" (pedido explícito do usuário).
    if (nextValue) update[`${key}At`] = new Date();
    await PlatformConfigModel.updateOne(
      { _id: PLATFORM_CONFIG_SINGLETON_ID },
      { $set: update },
      { upsert: true, setDefaultsOnInsert: true },
    );

    const doc = await PlatformConfigModel.findById(PLATFORM_CONFIG_SINGLETON_ID).lean();
    console.log(`"${key}" agora é ${nextValue}.`);
    console.log('Estado atual de platformConfig:');
    console.log({
      cnpjIntegrationsEnabled: doc?.cnpjIntegrationsEnabled ?? false,
      kdsAppEnabled: doc?.kdsAppEnabled ?? false,
      comandaAppEnabled: doc?.comandaAppEnabled ?? false,
      totemAppEnabled: doc?.totemAppEnabled ?? false,
      instagramAutomationEnabled: doc?.instagramAutomationEnabled ?? false,
    });
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
