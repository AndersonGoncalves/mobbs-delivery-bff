/**
 * specs/0025-adicionais-reutilizaveis-remocao — cadastra 3 grupos de adicionais reutilizáveis
 * pensados pra pizza (borda obrigatória, remover ingrediente, acréscimo opcional) e vincula os 4
 * nesse restaurante já com produtos no cardápio (`npm run seed:catalog`).
 *
 * Idempotente por substituição, igual aos outros scripts de seed: cada execução recria os 3
 * templates conhecidos (identificados pelo nome) e revincula às pizzas, sem duplicar nem afetar
 * outros grupos/templates que o operador já tenha criado manualmente pela retaguarda.
 *
 * Uso:
 *   npm run seed:additional-group-templates -- --slug=meu-restaurante
 *
 * (rode `npm run seed:catalog` antes, se o cardápio ainda não existir.)
 */
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { RestaurantModel } from '../src/modules/restaurants/infra/models/restaurant.mongoose.model';
import { ProductModel } from '../src/modules/catalog/infra/models/product.mongoose.model';
import { AdditionalGroupTemplateModel } from '../src/modules/additional-group-templates/infra/models/additional-group-template.mongoose.model';

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  for (const raw of process.argv.slice(2)) {
    const match = /^--([^=]+)=(.*)$/.exec(raw);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

// Os 3 grupos que cobrem o que foi pedido: borda obrigatória (escolher qual), remover algum
// ingrediente padrão, e acrescentar algo opcional — nesta ordem, pra aparecer assim no app.
const TEMPLATE_DEFINITIONS = [
  {
    name: 'Bordas',
    type: 'adicionar' as const,
    required: true,
    minSelections: 1,
    maxSelections: 1,
    options: [
      { name: 'Sem borda', priceDelta: 0 },
      { name: 'Borda Catupiry', priceDelta: 8 },
      { name: 'Borda Cheddar', priceDelta: 8 },
      { name: 'Borda Chocolate', priceDelta: 9.99 },
    ],
  },
  {
    name: 'Deseja remover algum ingrediente?',
    type: 'remover' as const,
    required: false,
    minSelections: 0,
    maxSelections: 5,
    options: [
      { name: 'Cebola', priceDelta: 0 },
      { name: 'Tomate', priceDelta: 0 },
      { name: 'Orégano', priceDelta: 0 },
      { name: 'Azeitona', priceDelta: 0 },
      { name: 'Molho extra de tomate', priceDelta: 0 },
    ],
  },
  {
    name: 'Acréscimos',
    type: 'adicionar' as const,
    required: false,
    minSelections: 0,
    maxSelections: 5,
    options: [
      { name: 'Bacon', priceDelta: 5 },
      { name: 'Catupiry extra', priceDelta: 6 },
      { name: 'Cheddar extra', priceDelta: 5 },
      { name: 'Ovo', priceDelta: 3 },
      { name: 'Milho', priceDelta: 3 },
    ],
  },
];

const KNOWN_TEMPLATE_NAMES = TEMPLATE_DEFINITIONS.map((t) => t.name);

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

  // Substitui só os 3 templates conhecidos (por nome) — nunca apaga um template que o operador
  // tenha criado manualmente pela retaguarda com outro nome.
  await AdditionalGroupTemplateModel.deleteMany({ restaurantId, name: { $in: KNOWN_TEMPLATE_NAMES } });

  const templates = await AdditionalGroupTemplateModel.insertMany(
    TEMPLATE_DEFINITIONS.map((def) => {
      const templateId = randomUUID();
      return {
        _id: templateId,
        restaurantId,
        name: def.name,
        type: def.type,
        required: def.required,
        minSelections: def.minSelections,
        maxSelections: def.maxSelections,
        isActive: true,
        options: def.options.map((option) => ({ id: randomUUID(), templateId, ...option })),
      };
    }),
  );

  // Vincula os 3 grupos a todo produto da categoria "Pizzas" — remove qualquer vínculo anterior
  // com esses mesmos 3 grupos antes (idempotência), sem tocar em outros grupos que o produto já
  // tenha (ex.: adicionado manualmente pela retaguarda).
  const pizzas = await ProductModel.find({ restaurantId, name: /^pizza/i });
  if (pizzas.length === 0) {
    console.warn('Nenhum produto com nome começando em "Pizza" encontrado — rode "npm run seed:catalog" antes.');
  }

  for (const pizza of pizzas) {
    const keptGroups = (pizza.additionalGroups ?? []).filter(
      (group: { name: string }) => !KNOWN_TEMPLATE_NAMES.includes(group.name),
    );
    const linkedGroups = templates.map((template) => {
      const groupId = randomUUID();
      return {
        id: groupId,
        productId: pizza._id,
        templateId: template._id,
        name: template.name,
        type: template.type,
        required: template.required,
        minSelections: template.minSelections,
        maxSelections: template.maxSelections,
        options: template.options.map((option) => ({
          id: randomUUID(),
          groupId,
          name: option.name,
          priceDelta: option.priceDelta,
        })),
      };
    });
    await ProductModel.updateOne({ _id: pizza._id }, { $set: { additionalGroups: [...keptGroups, ...linkedGroups] } });
  }

  console.log(`\nGrupos de adicionais reutilizáveis criados pra "${restaurant.name}" (${slug}):`);
  for (const template of templates) {
    console.log(`  ${template.name} (${template.type}, ${template.required ? 'obrigatório' : 'opcional'})`);
  }
  console.log(`\nVinculados a ${pizzas.length} produto(s) de pizza.`);
  console.log('\nTeste com:');
  console.log(`  curl http://localhost:3001/restaurants/${restaurantId}/menu-categories`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Falha ao popular os grupos de adicionais:', error);
  process.exitCode = 1;
});
