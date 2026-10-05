/**
 * specs/0042 — marca o status de cobrança de um restaurante (`ok` ou `blocked`) e, opcionalmente, o ciclo
 * (`monthly` ou `annual`). Sem gateway de pagamento nesta v1, é assim que a inadimplência é registrada.
 *
 * Uso:
 *   npm run set:billing-status -- --slug=primepizza --status=blocked
 *   npm run set:billing-status -- --slug=primepizza --status=ok --cycle=annual
 *
 * Preserva a faixa e os avisos já calculados; só troca os campos informados.
 */
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

import { RestaurantModel } from '../src/modules/restaurants/infra/models/restaurant.mongoose.model';
import { defaultBilling, monthKeyOf } from '../src/modules/billing/domain/billing';

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([a-z]+)=(.+)$/.exec(arg);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { slug, status, cycle } = args;

  if (!slug || (!status && !cycle)) {
    console.error('Uso: --slug=<slug> [--status=ok|blocked] [--cycle=monthly|annual]');
    process.exit(1);
  }
  if (status && status !== 'ok' && status !== 'blocked') {
    console.error('--status precisa ser "ok" ou "blocked".');
    process.exit(1);
  }
  if (cycle && cycle !== 'monthly' && cycle !== 'annual') {
    console.error('--cycle precisa ser "monthly" ou "annual".');
    process.exit(1);
  }

  const dbUrl = process.env.DB_URL ?? 'mongodb://localhost:27017/mobbs-delivery';
  await mongoose.connect(dbUrl);
  try {
    const restaurant = await RestaurantModel.findOne({ slug }).lean<{ _id: unknown; billing?: Record<string, unknown> }>();
    if (!restaurant) {
      console.error(`Restaurante com slug "${slug}" não encontrado.`);
      process.exit(1);
    }
    const current = restaurant.billing ?? defaultBilling(monthKeyOf(new Date()));
    const next = {
      ...current,
      ...(status ? { status: status as 'ok' | 'blocked' } : {}),
      ...(cycle ? { cycle: cycle as 'monthly' | 'annual' } : {}),
    };
    await RestaurantModel.updateOne({ _id: restaurant._id }, { $set: { billing: next } });
    console.log(`Cobrança de "${slug}": status=${next.status}, ciclo=${next.cycle}, faixa=${next.currentTier ?? 'free'}.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
