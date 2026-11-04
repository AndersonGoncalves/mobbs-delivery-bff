import type { Request, Response, Server } from 'restify';
import { BaseRouter } from '../../../shared/router/base.router';
import type { IPlatformConfigRepository } from '../domain/platform-config.repository.interface';

/**
 * specs/0201-controle-integracoes-cnpj-plataforma — endpoint público (ADR-3: não é dado
 * sensível nem específico de restaurante, precisa estar disponível antes até do login, ex. pra
 * montar a tela de checkout). App cliente e retaguarda leem o mesmo valor daqui pra esconder
 * Asaas subconta/Mercado Pago/Cartão de Crédito Online enquanto desabilitado.
 */
export class PlatformConfigController extends BaseRouter {
  constructor(private readonly platformConfigRepository: IPlatformConfigRepository) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.get('/platform/config', async (_req: Request, res: Response) => {
      const cnpjIntegrationsEnabled = await this.platformConfigRepository.isCnpjIntegrationsEnabled();
      res.json(200, { cnpjIntegrationsEnabled });
    });
  }
}
