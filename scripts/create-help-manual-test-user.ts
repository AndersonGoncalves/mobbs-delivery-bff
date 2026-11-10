/**
 * Script pontual (não parte do fluxo padrão) — cria/reseta a conta Firebase Auth do operador
 * fictício usado pra tirar os screenshots reais do módulo de Ajuda (`manual.ajuda.teste@
 * bsdelivery.com.br`), já que `seed-restaurant.ts` só cria o documento `RestaurantOperator`,
 * nunca a conta Firebase correspondente.
 *
 * Uso: npx ts-node --transpile-only scripts/create-help-manual-test-user.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import * as admin from 'firebase-admin';
import { ensureFirebaseAdminInitialized } from '../src/shared/config/firebase-admin';

const EMAIL = 'manual.ajuda.teste@bsdelivery.com.br';
const PASSWORD = 'ManualAjuda2026!';

async function main(): Promise<void> {
  ensureFirebaseAdminInitialized();
  try {
    const existing = await admin.auth().getUserByEmail(EMAIL);
    await admin.auth().updateUser(existing.uid, { password: PASSWORD });
    console.log('Usuário já existia — senha redefinida. UID:', existing.uid);
  } catch {
    const user = await admin.auth().createUser({ email: EMAIL, password: PASSWORD, emailVerified: true });
    console.log('Usuário criado. UID:', user.uid);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
