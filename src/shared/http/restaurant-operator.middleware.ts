import type { Request } from 'restify';
import { ForbiddenError } from 'restify-errors';

import { OperatorRole } from '../../modules/restaurant-operators/domain/entities/restaurant-operator.entity';
import { IRestaurantOperatorRepository } from '../../modules/restaurant-operators/domain/repositories/restaurant-operator.repository.interface';

declare module 'restify' {
  interface Request {
    restaurantId?: string;
    /** specs/0021-papeis-operador REQ-1 — papel do operador logado, populado aqui. */
    operatorRole?: OperatorRole;
    /** specs/0021-papeis-operador REQ-9 — id do próprio operador logado (auto-rebaixamento). */
    operatorId?: string;
  }
}

/**
 * specs/0002-autenticacao REQ-8/REQ-9 (T010/T020) — resolve o restaurante do operador logado a
 * partir do e-mail do token Firebase já validado por `firebaseAuthMiddleware` (sempre encadeado
 * depois dele). Sem vínculo ativo -> 403 (rejeitado, mesmo com token válido — a conta existe, só
 * não tem acesso a NENHUMA retaguarda). `req.restaurantId` fica disponível pras rotas
 * `/restaurants/me/...` (specs/0010), nunca resolvido por parâmetro de rota (isolamento
 * multi-tenant, plan.md de 0010).
 *
 * specs/0021-papeis-operador (plan.md, "Confirmado lendo o código real") — amplia pra também
 * anexar `req.operatorRole`/`req.operatorId`, consumidos por `requireOperatorRole` (sempre
 * encadeado depois deste middleware) pra checar permissão por módulo.
 *
 * Assinatura `async (req)`, sem `res`/`next` — mesma regra de arity do Restify que
 * `firebaseAuthMiddleware` (ver comentário lá).
 */
export function buildRestaurantOperatorMiddleware(repository: IRestaurantOperatorRepository) {
  return async function restaurantOperatorMiddleware(req: Request): Promise<void> {
    const email = req.user?.email;
    if (!email) {
      throw new ForbiddenError('Conta sem e-mail associado');
    }
    const operator = await repository.findActiveOperatorByEmail(email);
    if (!operator) {
      throw new ForbiddenError('E-mail sem acesso a nenhuma retaguarda');
    }
    req.restaurantId = operator.restaurantId;
    req.operatorRole = operator.role;
    req.operatorId = operator.id;
  };
}
