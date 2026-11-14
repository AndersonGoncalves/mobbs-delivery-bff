import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IFiscalConfigRepository } from '../domain/repositories/fiscal-config.repository.interface';
import { saveFiscalConfigSchema, setFiscalAutoEmitEnabledSchema, setFiscalProductionEnabledSchema } from './fiscal-config.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/** Nunca devolve `focusNfeToken`/`webhookToken` (mesmo cuidado de `asaasApiKey`/
 * `ifoodClientSecret`) — só confirmação de que a config existe e o estado dos botões de
 * produção/emissão automática.
 * `createdAt` adicionado em specs/0203-pendencias-fiscais-entregues-fechados REQ-1 — necessário
 * pro frontend não marcar como "pendência fiscal" um pedido entregue antes da integração
 * existir.
 * `autoEmitEnabled` adicionado em specs/0204-controle-emissao-fiscal-automatica REQ-5. */
function toPublicView(
  config: { restaurantId: string; environment: string; documentType: string; productionEnabled: boolean; autoEmitEnabled: boolean; cnpj: string; taxRegime?: string; createdAt: string } | null,
) {
  if (!config) return { connected: false };
  return {
    connected: true,
    environment: config.environment,
    documentType: config.documentType,
    productionEnabled: config.productionEnabled,
    autoEmitEnabled: config.autoEmitEnabled,
    cnpj: config.cnpj,
    // specs/0207-dados-fiscais-cadastro REQ-1.
    taxRegime: config.taxRegime,
    createdAt: config.createdAt,
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

    // "Botão" irmão do de produção acima (specs/0204-controle-emissao-fiscal-automatica) —
    // desligado, `FiscalEmissionService.emitForOrder` vira no-op; reemissão manual continua
    // funcionando normalmente (nunca checa este campo).
    application.put('/restaurants/me/fiscal-config/auto-emit', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const { autoEmitEnabled } = parseBody(setFiscalAutoEmitEnabledSchema, req.body);
      const config = await this.fiscalConfigRepository.setAutoEmitEnabled(req.restaurantId!, autoEmitEnabled);
      res.json(200, toPublicView(config));
    });

    application.del('/restaurants/me/fiscal-config', ...operatorAuthenticated, async (req: Request, res: Response) => {
      await this.fiscalConfigRepository.delete(req.restaurantId!);
      res.send(204);
    });
  }
}
