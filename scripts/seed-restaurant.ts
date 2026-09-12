/**
 * Cria (ou atualiza, se o slug já existir) um `Restaurant` + um `RestaurantOperator` (papel
 * `dono`) direto no MongoDB — não existe endpoint HTTP público pra isso ainda (ver README.md,
 * "Pendências"), então é o único jeito de ter um restaurante de teste sem inserir os documentos
 * manualmente no mongosh.
 *
 * Uso:
 *   npm run seed:restaurant -- --slug=meu-restaurante --name="Meu Restaurante" --email=voce@gmail.com --logoUrl=/home/anderson/Downloads/mcdonald1.jpg
 *
 * Todos os argumentos são opcionais (defaults abaixo). O e-mail do operador precisa bater com o
 * e-mail da conta Google que vai logar na retaguarda depois que um projeto Firebase real
 * existir — sem isso, o login na retaguarda não reconhece esse operador. `--logoUrl` é regravado
 * a cada execução (via `$set`, não `$setOnInsert`) — útil pra trocar a imagem de um restaurante
 * já existente sem recriar o documento.
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { RestaurantModel } from '../src/modules/restaurants/infra/models/restaurant.mongoose.model';
import { RestaurantOperatorModel } from '../src/modules/restaurant-operators/infra/models/restaurant-operator.mongoose.model';

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  for (const raw of process.argv.slice(2)) {
    const match = /^--([^=]+)=(.*)$/.exec(raw);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const slug = args.slug ?? 'restaurante-teste';
  const name = args.name ?? 'Restaurante Teste';
  const operatorEmail = args.email ?? 'operador@exemplo.com';
  const logoUrl = args.logoUrl;

  const dbUrl = process.env.DB_URL ?? 'mongodb://localhost:27017/mobbs-delivery';
  await mongoose.connect(dbUrl);
  console.log(`Conectado a ${dbUrl.replace(/:\/\/.*@/, '://***:***@')}`);

  const restaurant = await RestaurantModel.findOneAndUpdate(
    { slug },
    {
      $setOnInsert: {
        name,
        slug,
        isActive: true,
        businessHours: [],
        minimumOrderValue: 0,
        deliveryFeeCents: 0,
        whatsappConnected: false,
      },
      ...(logoUrl ? { $set: { logoUrl } } : {}),
    },
    { upsert: true, new: true },
  );

  const operator = await RestaurantOperatorModel.findOneAndUpdate(
    { restaurantId: restaurant._id, email: operatorEmail },
    {
      $setOnInsert: {
        restaurantId: restaurant._id,
        email: operatorEmail,
        role: 'dono',
        isActive: true,
      },
    },
    { upsert: true, new: true },
  );

  console.log('\nRestaurante pronto:');
  console.log(`  id: ${restaurant._id}`);
  console.log(`  slug: ${restaurant.slug}`);
  console.log(`  name: ${restaurant.name}`);
  console.log(`  logoUrl: ${restaurant.logoUrl ?? '(não definido)'}`);
  console.log('\nOperador (papel "dono"):');
  console.log(`  email: ${operator.email}`);
  console.log('\nTeste com:');
  console.log(`  curl http://localhost:3001/restaurants/resolve/${restaurant.slug}`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error('Falha ao criar o restaurante de teste:', error);
  process.exitCode = 1;
});
