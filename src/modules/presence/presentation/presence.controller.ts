import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IPresenceRepository } from '../domain/repositories/presence.repository.interface';
import { sendHeartbeatSchema } from './presence.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0045-usuarios-online-app — contador de "pessoas ativas agora" no cardápio de um
 * restaurante. `POST .../heartbeat` é pública e sem auth (REQ-1/REQ-2, decisão confirmada com o
 * usuário: conta toda sessão, anônima ou autenticada — a maioria dos clientes nunca autentica,
 * specs/0019-checkout-visitante); `GET .../presence/count` é da retaguarda, atrás de
 * firebaseAuthMiddleware + restaurantOperatorMiddleware, sem restrição de papel (mesmo padrão de
 * outras telas de configuração que não usam requireOperatorRole).
 */
export class PresenceController extends BaseRouter {
  constructor(
    private readonly presenceRepository: IPresenceRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    // AC-1 — REQ-4: se o restaurante não existir (app não conseguiu resolver), 404 antes de
    // gravar qualquer heartbeat. TODO(specs/0042, quando existir): recusar heartbeat também
    // quando o restaurante estiver bloqueado por inadimplência.
    application.post('/restaurants/:id/presence/heartbeat', async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.params.id);
      this.render(restaurant);

      const { sessionId } = parseBody(sendHeartbeatSchema, req.body);
      await this.presenceRepository.upsertHeartbeat(req.params.id, sessionId);
      res.send(204);
    });

    // AC-3
    application.get(
      '/restaurants/me/presence/count',
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      async (req: Request, res: Response) => {
        const count = await this.presenceRepository.countActive(req.restaurantId!);
        res.json(200, { count });
      },
    );
  }
}
