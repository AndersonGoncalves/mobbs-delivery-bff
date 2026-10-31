// Teste de carga — Fase A (seed): popula a base local com ~1 ano de movimentação sintética, na
// escala combinada em 2026-10-31. SEMPRE apaga as coleções que gerencia antes de inserir de
// novo (ver reset.ts) — não é incremental.
//
// Uso:
//   npm run loadtest:seed            -- pede confirmação (digitar "APAGAR") antes de limpar
//   npm run loadtest:seed -- --yes   -- pula a confirmação (uso em automação)
//   npm run loadtest:seed -- --seed=42  -- muda a seed do PRNG (default: 1), reprodutível
import * as dotenv from 'dotenv';
import * as readline from 'readline';
import mongoose from 'mongoose';
import { createPrng } from './prng';
import { dropLoadTestCollections, rebuildIndexes } from './reset';
import { generateRestaurants } from './generators/restaurants';
import { generateCustomers, generateAddresses } from './generators/customers';
import { generateOrders } from './generators/orders';

dotenv.config({ path: '.env' });

function parseArgs(): { yes: boolean; seed: number } {
  const args = process.argv.slice(2);
  const yes = args.includes('--yes');
  const seedArg = args.find((a) => a.startsWith('--seed='));
  const seed = seedArg ? Number(seedArg.split('=')[1]) : 1;
  return { yes, seed };
}

function redact(url: string): string {
  return url.replace(/:\/\/.*@/, '://***:***@');
}

function progressLine(label: string, done: number, total: number, extra = ''): void {
  const pct = total === 0 ? 100 : Math.floor((done / total) * 100);
  process.stdout.write(`\r${label}: ${done}/${total} (${pct}%)${extra ? ` — ${extra}` : ''}   `);
}

async function confirm(dbUrl: string): Promise<void> {
  console.log(`Isto vai APAGAR as coleções do teste de carga em: ${redact(dbUrl)}`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question('Digite APAGAR para confirmar: ', resolve));
  rl.close();
  if (answer.trim() !== 'APAGAR') {
    console.log('Cancelado (resposta não foi "APAGAR").');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const { yes, seed } = parseArgs();
  const dbUrl = process.env.DB_URL ?? 'mongodb://localhost:27017/mobbs-delivery';

  if (!yes) await confirm(dbUrl);

  console.log(`Conectando em ${redact(dbUrl)}...`);
  await mongoose.connect(dbUrl);

  const startedAt = Date.now();
  const rng = createPrng(seed);

  console.log('\nLimpando coleções do teste de carga...');
  await dropLoadTestCollections();

  console.log('\nGerando restaurantes, categorias, produtos e matérias-primas...');
  const restaurants = await generateRestaurants(rng, (done, total) => progressLine('Restaurantes', done, total));
  console.log('');

  console.log('\nGerando clientes...');
  const customerIds = await generateCustomers(rng, (done, total) => progressLine('Clientes', done, total));
  console.log('');

  console.log('\nGerando endereços...');
  await generateAddresses(rng, customerIds, (done, total) => progressLine('Endereços (por cliente)', done, total));
  console.log('');

  console.log('\nGerando pedidos (1 ano) e pagamentos — a coleção mais pesada, pode demorar...');
  const totalOrders = await generateOrders(rng, restaurants, customerIds, (done, total, ordersSoFar) =>
    progressLine('Restaurantes processados', done, total, `${ordersSoFar} pedidos gerados até agora`),
  );
  console.log('');

  console.log('\nReconstruindo índices...');
  await rebuildIndexes();

  const db = mongoose.connection.db;
  if (!db) throw new Error('Conexão com o banco não disponível para o relatório final.');
  const stats = await db.stats();
  const elapsedMinutes = (Date.now() - startedAt) / 60_000;

  console.log('\n=== Teste de carga: seed concluído ===');
  console.log(`Restaurantes: ${restaurants.length}`);
  console.log(`Clientes: ${customerIds.length}`);
  console.log(`Pedidos: ${totalOrders}`);
  console.log(`Tamanho do banco (dataSize): ${(stats.dataSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`Tamanho do banco (storageSize): ${(stats.storageSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`Tamanho dos índices (indexSize): ${(stats.indexSize / 1024 / 1024 / 1024).toFixed(2)} GB`);
  console.log(`Tempo total: ${elapsedMinutes.toFixed(1)} min`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
