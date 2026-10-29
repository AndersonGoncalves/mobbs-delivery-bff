import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IUberDeliveryConfigRepository } from '../domain/repositories/uber-delivery-config.repository.interface';
import { saveUberDeliveryConfigSchema } from './uber-delivery-config.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/** Nunca devolve `clientSecret`/`webhookToken` (mesmo cuidado de `focusNfeToken`/
 * `ifoodClientSecret`) — só confirmação de que a config existe e os campos não-sensíveis. */
function toPublicView(config: { restaurantId: string; customerId: string; clientId: string; originZipCode: string } | null) {
  if (!config) return { connected: false };
  return {
    connected: true,
    customerId: config.customerId,
    clientId: config.clientId,
    originZipCode: config.originZipCode,
  };
}

/**
 * specs/0121-integracao-uber-entregas REQ-1 — cadastro da configuração Uber Direct (credenciais +
 * CEP de origem), restrito a dono/gerente (mesmo padrão de `FiscalConfigController`/
 * `IFoodOnboardingController`).
 */
export class UberDeliveryConfigController extends BaseRouter {
  constructor(
    private readonly uberDeliveryConfigRepository: IUberDeliveryConfigRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const operatorAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    application.get('/restaurants/me/uber-delivery-config', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const config = await this.uberDeliveryConfigRepository.findByRestaurantId(req.restaurantId!);
      res.json(200, toPublicView(config));
    });

    application.put('/restaurants/me/uber-delivery-config', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const input = parseBody(saveUberDeliveryConfigSchema, req.body);
      const config = await this.uberDeliveryConfigRepository.upsert(req.restaurantId!, input);
      res.json(200, toPublicView(config));
    });

    application.del('/restaurants/me/uber-delivery-config', ...operatorAuthenticated, async (req: Request, res: Response) => {
      await this.uberDeliveryConfigRepository.delete(req.restaurantId!);
      res.send(204);
    });
  }
}
