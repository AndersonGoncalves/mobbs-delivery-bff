import type { Request, Response, Server } from 'restify';
import { BaseRouter } from '../../../shared/router/base.router';
import type { IPlatformConfigRepository } from '../domain/platform-config.repository.interface';

/**
 * specs/0201-controle-integracoes-cnpj-plataforma — endpoint público (ADR-3: não é dado
 * sensível nem específico de restaurante, precisa estar disponível antes até do login, ex. pra
 * montar a tela de checkout). App cliente e retaguarda leem o mesmo valor daqui pra esconder
 * Asaas subconta/Mercado Pago/Cartão de Crédito Online enquanto desabilitado.
 *
 * (ajuste 10/11/2026, pedido explícito do usuário) — mesmo endpoint também devolve
 * `kdsAppEnabled`/`comandaAppEnabled`/`totemAppEnabled`, pros respectivos apps (mobbs-delivery-kds/
 * -comanda/-totem) se autoverificarem no boot, mesmo princípio do switch de CNPJ.
 */
export class PlatformConfigController extends BaseRouter {
  constructor(private readonly platformConfigRepository: IPlatformConfigRepository) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.get('/platform/config', async (_req: Request, res: Response) => {
      const [cnpjIntegrationsEnabled, kdsAppEnabled, comandaAppEnabled, totemAppEnabled] = await Promise.all([
        this.platformConfigRepository.isCnpjIntegrationsEnabled(),
        this.platformConfigRepository.isKdsAppEnabled(),
        this.platformConfigRepository.isComandaAppEnabled(),
        this.platformConfigRepository.isTotemAppEnabled(),
      ]);
      res.json(200, { cnpjIntegrationsEnabled, kdsAppEnabled, comandaAppEnabled, totemAppEnabled });
    });
  }
}
