/**
 * specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login REQ-3 — popula `imageUrl` (nível
 * de OPÇÃO, não mais de grupo — ver `AdditionalGroupTemplateModel`) pra todas as opções de todos
 * os `AdditionalGroupTemplate`s de um restaurante, com fotos de placeholder (mesmo serviço/
 * convenção de `seed-catalog.ts`/`seed-highlights.ts`: `picsum.photos`, seed determinístico por
 * nome — não é uma foto real do prato/bebida, só o suficiente pra exercitar o layout do app
 * (`AdditionalGroupSection`) e da retaguarda (`AdditionalGroupFieldsEditor`) com imagem de
 * verdade em vez de placeholder vazio.
 *
 * Templates com `templateId` são "vínculo vivo" (`ProductMongooseRepository.resolveGroup`) — a
 * foto aparece em qualquer produto vinculado automaticamente, sem precisar tocar em `Product`.
 *
 * Idempotente: mesmo nome de opção sempre gera a mesma URL (mesmo seed), então rodar de novo não
 * muda nada; só preenche onde `imageUrl` ainda está vazio (não sobrescreve foto já cadastrada
 * manualmente pela retaguarda).
 *
 * Uso:
 *   npm run seed:additional-group-option-images -- --slug=meu-restaurante
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { RestaurantModel } from '../src/modules/restaurants/infra/models/restaurant.mongoose.model';
import { AdditionalGroupTemplateModel } from '../src/modules/additional-group-templates/infra/models/additional-group-template.mongoose.model';

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  for (const raw of process.argv.slice(2)) {
    const match = /^--([^=]+)=(.*)$/.exec(raw);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

const ACCENTS: Record<string, string> = { á: 'a', à: 'a', ã: 'a', â: 'a', é: 'e', ê: 'e', í: 'i', ó: 'o', ô: 'o', õ: 'o', ú: 'u', ç: 'c' };

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[áàãâéêíóôõúç]/g, (char) => ACCENTS[char] ?? char)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const picsum = (seed: string) => `https://picsum.photos/seed/${seed}/300/300`;

async function main(): Promise<void> {
  const args = parseArgs();
  const slug = args.slug ?? 'meu-restaurante';

  const dbUrl = process.env.DB_URL ?? 'mongodb://localhost:27017/mobbs-delivery';
  await mongoose.connect(dbUrl);
  console.log(`Conectado a ${dbUrl.replace(/:\/\/.*@/, '://***:***@')}`);

  const restaurant = await RestaurantModel.findOne({ slug });
  if (!restaurant) {
    console.error(`Nenhum restaurante com slug "${slug}" — rode "npm run seed:restaurant" antes.`);
    process.exitCode = 1;
    await mongoose.disconnect();
    return;
  }
  const restaurantId = restaurant._id as string;

  const templates = await AdditionalGroupTemplateModel.find({ restaurantId });
  if (templates.length === 0) {
    console.warn(`Nenhum grupo de adicionais pra "${slug}" — rode "npm run seed:additional-group-templates" antes.`);
    await mongoose.disconnect();
    return;
  }

  let updatedOptions = 0;
  for (const template of templates) {
    let changed = false;
    for (const option of template.options) {
      if (option.imageUrl) continue; // não sobrescreve foto já cadastrada manualmente.
      option.imageUrl = picsum(slugify(`${template.name}-${option.name}`));
      changed = true;
      updatedOptions++;
    }
    if (changed) await template.save();
  }

  console.log(`\nFotos aplicadas em ${updatedOptions} opção(ões), em ${templates.length} grupo(s) de "${restaurant.name}" (${slug}):`);
  for (const template of templates) {
    console.log(`  ${template.name}:`);
    for (const option of template.options) {
      console.log(`    ${option.name} -> ${option.imageUrl}`);
    }
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Falha ao popular as fotos dos grupos de adicionais:', error);
  process.exitCode = 1;
});
