import * as admin from 'firebase-admin';

/**
 * `admin.auth()` sem `admin.initializeApp()` antes lança "The default Firebase app does not
 * exist" — gap real encontrado ao registrar `firebaseAuthMiddleware` numa rota de verdade pela
 * primeira vez (specs/0010-configuracao-restaurante); antes disso o middleware só era chamado em
 * teste unitário, com `firebase-admin` mockado, então nunca precisou de um app real.
 *
 * `initializeApp()` sem argumentos usa Application Default Credentials
 * (`GOOGLE_APPLICATION_CREDENTIALS`) e não lança na hora — a falha só aparece no primeiro
 * `verifyIdToken()` de verdade, se não houver credencial válida. Sem projeto Firebase real
 * configurado ainda (mesmo blocker externo documentado em `specs/0002-autenticacao`), toda
 * chamada autenticada vai rejeitar com 401 até existir um projeto de verdade — comportamento
 * esperado, não um bug.
 */
export function ensureFirebaseAdminInitialized(): void {
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }
}
