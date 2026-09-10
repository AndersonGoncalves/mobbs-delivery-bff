import type { Request } from 'restify';
import { ForbiddenError } from 'restify-errors';

import { OperatorRole } from '../../modules/restaurant-operators/domain/entities/restaurant-operator.entity';

/**
 * specs/0021-papeis-operador REQ-2/REQ-3/REQ-4/REQ-5/REQ-6 — factory de middleware que restringe
 * uma rota a um subconjunto de papéis (`role`). Sempre encadeado **depois** de
 * `restaurantOperatorMiddleware` (que popula `req.operatorRole` — se não estiver populado, é bug
 * de composição da rota, não uma requisição inválida do cliente, daí o 403 genérico igual).
 *
 * REQ-5: esta é a barreira real (o BFF nunca confia só na retaguarda escondendo o botão) — a web
 * só espelha isso pra UX (`AppShell`/`ProtectedRoute`, mobbs-delivery-web).
 *
 * Assinatura `async (req)`, sem `res`/`next` — mesma regra de arity do Restify que
 * `firebaseAuthMiddleware`/`restaurantOperatorMiddleware`.
 */
export function requireOperatorRole(...roles: OperatorRole[]) {
  return async function operatorRoleGuard(req: Request): Promise<void> {
    if (!req.operatorRole || !roles.includes(req.operatorRole)) {
      throw new ForbiddenError('Papel do operador não tem acesso a este módulo');
    }
  };
}
