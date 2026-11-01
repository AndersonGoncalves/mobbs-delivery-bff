// Fase B (k6) — gera scripts/load-test/k6/fixtures.json: uma amostra de restaurantes/produtos
// (do banco já populado pela Fase A) + um pool de ID tokens VÁLIDOS do Firebase Auth Emulator
// pra autenticar como clientes sintéticos.
//
// Por quê um emulador: todas as rotas de cliente do BFF exigem um ID token real do Firebase
// (`firebaseAuthMiddleware` -> `admin.auth().verifyIdToken()`), e os clientes sintéticos da Fase
// A não existem no Firebase de verdade. O emulador deixa o fluxo 100% local — nenhum dado
// sintético toca o projeto Firebase real (ver scripts/load-test/README.md).
//
// Pré-requisito: emulador rodando (`npm run loadtest:emulator`) ANTES de rodar este script.
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import * as admin from 'firebase-admin';
import { RestaurantModel } from '../../../src/modules/restaurants/infra/models/restaurant.mongoose.model';
import { ProductModel } from '../../../src/modules/catalog/infra/models/product.mongoose.model';
import { CustomerModel } from '../../../src/modules/customers/infra/models/customer.mongoose.model';
import { OrderModel } from '../../../src/modules/orders/infra/models/order.mongoose.model';

dotenv.config({ path: '.env' });

const EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
process.env.FIREBASE_AUTH_EMULATOR_HOST = EMULATOR_HOST;

const RESTAURANT_SAMPLE = 50;
const CUSTOMER_SAMPLE = 300;

async function mintIdToken(uid: string): Promise<string> {
  const customToken = await admin.auth().createCustomToken(uid);
  const res = await fetch(`http://${EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=any`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  if (!res.ok) {
    throw new Error(`Falha trocando custom token por ID token (uid=${uid}): ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { idToken: string };
  return body.idToken;
}

async function main(): Promise<void> {
  const dbUrl = process.env.DB_URL ?? 'mongodb://localhost:27017/mobbs-delivery';
  console.log(`Conectando em ${dbUrl.replace(/:\/\/.*@/, '://***:***@')}...`);
  await mongoose.connect(dbUrl);
  admin.initializeApp({ projectId: 'mobbs-delivery-app' });

  console.log(`Amostrando ${RESTAURANT_SAMPLE} restaurantes...`);
  const restaurants = await RestaurantModel.aggregate([{ $match: { slug: /^loadtest-/ } }, { $sample: { size: RESTAURANT_SAMPLE } }]);

  const restaurantFixtures: { id: string; slug: string; products: { id: string; name: string; price: number }[]; sampleTrackingToken: string | null }[] = [];
  for (const restaurant of restaurants) {
    const products = await ProductModel.find({ restaurantId: restaurant._id }).limit(10).lean();
    if (products.length === 0) continue;
    const sampleOrder = await OrderModel.findOne({ restaurantId: restaurant._id }).lean();
    restaurantFixtures.push({
      id: restaurant._id,
      slug: restaurant.slug,
      products: products.map((p) => ({ id: p._id, name: p.name, price: p.price })),
      sampleTrackingToken: sampleOrder?.trackingToken ?? null,
    });
  }

  console.log(`Amostrando ${CUSTOMER_SAMPLE} clientes e gerando ID tokens no emulador (${EMULATOR_HOST})...`);
  const customers = await CustomerModel.aggregate([{ $sample: { size: CUSTOMER_SAMPLE } }]);
  const tokens: { customerId: string; idToken: string }[] = [];
  for (let i = 0; i < customers.length; i++) {
    const idToken = await mintIdToken(customers[i]._id);
    tokens.push({ customerId: customers[i]._id, idToken });
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${customers.length}`);
  }

  const outPath = path.join(__dirname, 'fixtures.json');
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), restaurants: restaurantFixtures, tokens }, null, 2));
  console.log(`\nFixtures gravadas em ${outPath}`);
  console.log(`${restaurantFixtures.length} restaurantes, ${tokens.length} tokens.`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
