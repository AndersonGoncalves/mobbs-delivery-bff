import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IFiscalConfigRepository } from '../domain/repositories/fiscal-config.repository.interface';
import { saveFiscalConfigSchema, setFiscalProductionEnabledSchema } from './fiscal-config.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/** Nunca devolve `focusNfeToken`/`webhookToken` (mesmo cuidado de `asaasApiKey`/
 * `ifoodClientSecret`) — só confirmação de que a config existe e o estado do botão de produção. */
function toPublicView(config: { restaurantId: string; environment: string; documentType: string; productionEnabled: boolean; cnpj: string } | null) {
  if (!config) return { connected: false };
  return {
    connected: true,
    environment: config.environment,
    documentType: config.documentType,
    productionEnabled: config.productionEnabled,
    cnpj: config.cnpj,
  };
}

/**
 * specs/0091-integracao-fiscal-focusnfe REQ-1 — cadastro da configuração fiscal (token/
 * ambiente/documento da FocusNFe), restrito a dono/gerente (mesmo padrão de
 * `AsaasOnboardingController`/`IFoodOnboardingController`).
 */
export class FiscalConfigController extends BaseRouter {
  constructor(
    private readonly fiscalConfigRepository: IFiscalConfigRepository,
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

    application.get('/restaurants/me/fiscal-config', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const config = await this.fiscalConfigRepository.findByRestaurantId(req.restaurantId!);
      res.json(200, toPublicView(config));
    });

    application.put('/restaurants/me/fiscal-config', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const input = parseBody(saveFiscalConfigSchema, req.body);
      const config = await this.fiscalConfigRepository.upsert(req.restaurantId!, input);
      res.json(200, toPublicView(config));
    });

    // "Botão de ativar produção" (`plan.md`) — ação deliberadamente separada do PUT geral acima,
    // nunca ligada de volta sozinha ao trocar token/ambiente.
    application.put('/restaurants/me/fiscal-config/production', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const { productionEnabled } = parseBody(setFiscalProductionEnabledSchema, req.body);
      const config = await this.fiscalConfigRepository.setProductionEnabled(req.restaurantId!, productionEnabled);
      res.json(200, toPublicView(config));
    });

    application.del('/restaurants/me/fiscal-config', ...operatorAuthenticated, async (req: Request, res: Response) => {
      await this.fiscalConfigRepository.delete(req.restaurantId!);
      res.send(204);
    });
  }
}
