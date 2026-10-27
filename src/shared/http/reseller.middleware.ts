import type { Request } from 'restify';
import { ForbiddenError } from 'restify-errors';

import { IResellerRepository } from '../../modules/resellers/domain/repositories/reseller.repository.interface';

declare module 'restify' {
  interface Request {
    /** specs/0189-painel-revenda REQ-3 — id do `Reseller` logado, populado aqui. */
    resellerId?: string;
  }
}

/**
 * specs/0189-painel-revenda REQ-3/REQ-4 — resolve o `Reseller` do e-mail do token Firebase já
 * validado por `firebaseAuthMiddleware` (sempre encadeado depois dele). Sem `Reseller`
 * correspondente OU com `isActive === false` -> 403 (mesma resposta dos dois casos, REQ-4), sem
 * revelar se o e-mail existe mas está inativo. Mesmo molde de
 * `buildRestaurantOperatorMiddleware` (`restaurant-operator.middleware.ts`).
 */
export function buildResellerMiddleware(repository: IResellerRepository) {
  return async function resellerMiddleware(req: Request): Promise<void> {
    const email = req.user?.email;
    if (!email) {
      throw new ForbiddenError('Conta sem e-mail associado');
    }
    const reseller = await repository.findByEmail(email);
    if (!reseller || !reseller.isActive) {
      throw new ForbiddenError('Acesso restrito a revendedores ativos');
    }
    req.resellerId = reseller.id;
  };
}
