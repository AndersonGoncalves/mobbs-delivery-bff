import type { Request, Response, Next } from 'restify';
import { UnauthorizedError } from 'restify-errors';
import * as admin from 'firebase-admin';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
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
 */
export async function firebaseAuthMiddleware(req: Request, _res: Response, next: Next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Token ausente'));
  }
  try {
    const decodedToken = await admin.auth().verifyIdToken(authHeader.slice(7));
    req.user = { uid: decodedToken.uid, email: decodedToken.email };
    return next();
  } catch {
    return next(new UnauthorizedError('Token inválido ou expirado'));
  }
}
