import type { Request, Response, Server } from 'restify';

import { environment } from '../../../shared/config/environment';
import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IUberDeliveryConfigRepository } from '../domain/repositories/uber-delivery-config.repository.interface';
import { saveUberDeliveryConfigSchema } from './uber-delivery-config.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * Nunca devolve `clientSecret` (segredo da Uber, o restaurante já tem — mesmo cuidado de
 * `focusNfeToken`/`ifoodClientSecret`). `webhookToken`, diferente desses, é gerado por NÓS e
 * precisa chegar ao operador: a Uber não tem API pra registrar webhook (diferente de
 * Asaas/`asaas-onboarding.controller.ts`, que registra sozinho) — o próprio restaurante precisa
 * colar esta URL no painel de desenvolvedor da Uber à mão. Achado real (10/11/2026, pedido
 * explícito do usuário) — sem isso, dá pra despachar uma entrega de teste mas o status nunca
 * atualiza (nenhum webhook chega), testado documentado como pendência em
 * `docs/contas-de-integracao/uber-direct.md` §4 (agora corrigida).
 */
function toPublicView(config: { restaurantId: string; customerId: string; clientId: string; originZipCode: string; webhookToken: string } | null) {
  if (!config) return { connected: false };
  return {
    connected: true,
    customerId: config.customerId,
    clientId: config.clientId,
    originZipCode: config.originZipCode,
    webhookUrl: `${environment.server.publicBaseUrl}/webhooks/uber-direct/${config.restaurantId}?token=${config.webhookToken}`,
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
