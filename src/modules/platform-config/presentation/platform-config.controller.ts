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
 *
 * (ajuste 11/11/2026, pedido explícito do usuário) — mais um campo, `instagramAutomationEnabled`,
 * usado pelo menu lateral da retaguarda (`nav-items.tsx`) pra liberar "Automação Instagram".
 *
 * (ajuste 11/11/2026, pedido explícito do usuário, follow-up) — tag "Novo" no menu: mais 5 campos
 * `<switch>IsNew`, `true` só nos primeiros 10 dias depois do switch correspondente ter virado
 * `true` (`PlatformConfigSnapshot.<switch>EnabledAt`, carimbado pelo script de ativação). Depois
 * dos 10 dias (ou se o switch nunca foi ativado/está desligado), some pra sempre — reativar
 * reinicia a contagem (novo carimbo a cada ativação, pedido explícito do usuário). Calculado aqui
 * (não no repositório) porque é regra de apresentação do menu, não do domínio do switch em si.
 */
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

function isNew(enabled: boolean, enabledAt: Date | undefined): boolean {
  if (!enabled || !enabledAt) return false;
  return Date.now() - new Date(enabledAt).getTime() < TEN_DAYS_MS;
}

export class PlatformConfigController extends BaseRouter {
  constructor(private readonly platformConfigRepository: IPlatformConfigRepository) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.get('/platform/config', async (_req: Request, res: Response) => {
      const snapshot = await this.platformConfigRepository.getSnapshot();
      res.json(200, {
        cnpjIntegrationsEnabled: snapshot.cnpjIntegrationsEnabled,
        cnpjIntegrationsIsNew: isNew(snapshot.cnpjIntegrationsEnabled, snapshot.cnpjIntegrationsEnabledAt),
        kdsAppEnabled: snapshot.kdsAppEnabled,
        kdsAppIsNew: isNew(snapshot.kdsAppEnabled, snapshot.kdsAppEnabledAt),
        comandaAppEnabled: snapshot.comandaAppEnabled,
        comandaAppIsNew: isNew(snapshot.comandaAppEnabled, snapshot.comandaAppEnabledAt),
        totemAppEnabled: snapshot.totemAppEnabled,
        totemAppIsNew: isNew(snapshot.totemAppEnabled, snapshot.totemAppEnabledAt),
        instagramAutomationEnabled: snapshot.instagramAutomationEnabled,
        instagramAutomationIsNew: isNew(snapshot.instagramAutomationEnabled, snapshot.instagramAutomationEnabledAt),
      });
    });
  }
}
