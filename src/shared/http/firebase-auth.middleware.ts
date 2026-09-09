import type { Request } from 'restify';
import { UnauthorizedError } from 'restify-errors';
import * as admin from 'firebase-admin';

import { ensureFirebaseAdminInitialized } from '../config/firebase-admin';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  /** specs/0011-perfil-cliente — usados só pra sintetizar o perfil na 1ª vez (antes de existir
   * um `Customer` persistido); nunca sobrescrevem o que já foi salvo em `/customers/me`. */
  name?: string;
  picture?: string;
}

declare module 'restify' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

/**
 * REQ-6/REQ-7 (specs/0002-autenticacao): valida o ID token do Firebase enviado em
 * `Authorization: Bearer <idToken>` antes de qualquer handler de negócio (docs/architecture/patterns.md
 * §17.1). Sem token ou token inválido -> 401. Token válido -> `req.user` disponível na rota.
 *
 * Assinatura `async (req)`, sem `res`/`next` (nenhum dos dois é usado) — mesma regra de arity do
 * Restify já documentada em `RestaurantsController` (T008 de specs/0009): um handler assíncrono
 * no chain só pode ter no máximo 2 parâmetros, sinalizando sucesso/erro por retorno/`throw`, nunca
 * chamando `next()` manualmente. Isso vale pra **todo** handler da chain, não só o último —
 * `firebaseAuthMiddleware`
 * tinha `next` na assinatura original (funcionava nos testes unitários, que chamam a função
 * direto, mas nunca tinha sido de fato registrado numa rota Restify real; ia lançar
 * `AssertionError` na inicialização do servidor assim que fosse).
 */
export async function firebaseAuthMiddleware(req: Request): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token ausente');
  }
  try {
    ensureFirebaseAdminInitialized();
    const decodedToken = await admin.auth().verifyIdToken(authHeader.slice(7));
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
      picture: decodedToken.picture,
    };
  } catch {
    throw new UnauthorizedError('Token inválido ou expirado');
  }
}
