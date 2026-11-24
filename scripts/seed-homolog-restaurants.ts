/**
 * specs/0215-ambiente-homologacao REQ-5 (T004a) — cria os restaurantes fixos de teste do ambiente
 * de homologação (`pizzaria`, `hamburgueria`, `pastelaria`), cada um:
 * - com o mesmo estado inicial de um autocadastro real (`buildNewRestaurantInput`) e o catálogo
 *   padrão do próprio tipo de negócio (`seedDefaultCatalog`);
 * - com 6 operadores, um por papel (dono, gerente, caixa/`financeiro`, garçom, motoboy, cozinha),
 *   e a conta Firebase Authentication de cada um (senha única `123456`, e-mail já verificado).
 *   Os operadores `garcom`/`motoboy` já alimentam as páginas "Garçons"/"Motoboys" da retaguarda
 *   (que listam operadores desses papéis), sem cadastro separado.
 *
 * Idempotente: restaurante já existente (mesmo slug) não é recriado nem tem o catálogo semeado de
 * novo; operadores e contas Firebase são garantidos (criados ou reativados, senha redefinida).
 * Pra voltar um restaurante ao estado inicial: `reset:test-restaurant -- --slug=<slug>` (apaga
 * restaurante + contas Firebase dos operadores) e rodar este seed de novo.
 *
 * ATENÇÃO: o Firebase Authentication é compartilhado com produção (decisão do usuário,
 * 19/11/2026) — as contas existem lá também, mas sem vínculo de operador no Mongo de produção.
 * Só rode com o `.env` apontando pro Mongo de HOMOLOGAÇÃO.
 *
 * Uso:
 *   npm run seed:homolog-restaurants -- --confirmar=homologacao
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import * as admin from 'firebase-admin';

dotenv.config({ path: '.env' });

import { ensureFirebaseAdminInitialized } from '../src/shared/config/firebase-admin';
import { RestaurantMongooseRepository } from '../src/modules/restaurants/infra/repositories/restaurant.mongoose.repository';
import { RestaurantOperatorModel } from '../src/modules/restaurant-operators/infra/models/restaurant-operator.mongoose.model';
import { MenuCategoryMongooseRepository } from '../src/modules/catalog/infra/repositories/menu-category.mongoose.repository';
import { ProductMongooseRepository } from '../src/modules/catalog/infra/repositories/product.mongoose.repository';
import { PromotionMongooseRepository } from '../src/modules/promotions/infra/repositories/promotion.mongoose.repository';
import { RawMaterialMongooseRepository } from '../src/modules/raw-materials/infra/repositories/raw-material.mongoose.repository';
import { AdditionalGroupTemplateMongooseRepository } from '../src/modules/additional-group-templates/infra/repositories/additional-group-template.mongoose.repository';
import { buildNewRestaurantInput } from '../src/modules/restaurants/domain/build-new-restaurant-input';
import { seedDefaultCatalog } from '../src/modules/restaurants/domain/seed-default-catalog';
import {
  HOMOLOG_TEST_PASSWORD,
  HOMOLOG_TEST_RESTAURANTS,
  HomologTestOperator,
  buildHomologOperators,
  isHomologConfirmed,
} from './homolog-test-restaurants';

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  for (const raw of process.argv.slice(2)) {
    const match = /^--([^=]+)=(.*)$/.exec(raw);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function ensureFirebaseUser(operator: HomologTestOperator): Promise<'criada' | 'atualizada'> {
  const profile = { password: HOMOLOG_TEST_PASSWORD, emailVerified: true, displayName: operator.name, disabled: false };
  try {
    const existing = await admin.auth().getUserByEmail(operator.email);
    await admin.auth().updateUser(existing.uid, profile);
    return 'atualizada';
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
    await admin.auth().createUser({ email: operator.email, ...profile });
    return 'criada';
  }
}

async function main(): Promise<void> {
  if (!isHomologConfirmed(parseArgs())) {
    console.error('[seed-homolog-restaurants] recusado: passe --confirmar=homologacao (e confira que o .env aponta pro Mongo de homologação).');
    process.exit(1);
  }

  const dbUrl = process.env.DB_URL ?? 'mongodb://localhost:27017/mobbs-delivery';
  await mongoose.connect(dbUrl);
  console.log(`Conectado a ${dbUrl.replace(/:\/\/.*@/, '://***:***@')}`);
  ensureFirebaseAdminInitialized();

  const restaurantRepository = new RestaurantMongooseRepository();
  const promotionRepository = new PromotionMongooseRepository();
  const catalogDeps = {
    menuCategoryRepository: new MenuCategoryMongooseRepository(promotionRepository),
    productRepository: new ProductMongooseRepository(promotionRepository),
    additionalGroupTemplateRepository: new AdditionalGroupTemplateMongooseRepository(),
    rawMaterialRepository: new RawMaterialMongooseRepository(),
  };

  for (const testRestaurant of HOMOLOG_TEST_RESTAURANTS) {
    let restaurant = await restaurantRepository.findBySlug(testRestaurant.slug);
    if (restaurant) {
      console.log(`\n[${testRestaurant.slug}] já existe (${restaurant.id}) — restaurante e catálogo mantidos.`);
    } else {
      restaurant = await restaurantRepository.create(
        buildNewRestaurantInput({ name: testRestaurant.name, slug: testRestaurant.slug, businessType: testRestaurant.businessType }),
      );
      await seedDefaultCatalog(restaurant.id, testRestaurant.businessType, catalogDeps);
      console.log(`\n[${testRestaurant.slug}] criado (${restaurant.id}) com catálogo padrão de "${testRestaurant.businessType}".`);
    }

    for (const operator of buildHomologOperators(testRestaurant)) {
      await RestaurantOperatorModel.findOneAndUpdate(
        { restaurantId: restaurant.id, email: operator.email },
        {
          $set: { role: operator.role, name: operator.name, isActive: true },
          $setOnInsert: { restaurantId: restaurant.id, email: operator.email },
        },
        { upsert: true, new: true },
      );
      const firebaseResult = await ensureFirebaseUser(operator);
      console.log(`  ${operator.role.padEnd(10)} ${operator.email.padEnd(40)} (conta Firebase ${firebaseResult})`);
    }
  }

  console.log(`\nSenha de todas as contas: ${HOMOLOG_TEST_PASSWORD}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (error) => {
  console.error('[seed-homolog-restaurants] falha:', error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
