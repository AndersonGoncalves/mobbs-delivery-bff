import type { Request, Response, Server } from 'restify';
import { BaseRouter } from '../../../shared/router/base.router';
import type { IPlatformConfigRepository } from '../domain/platform-config.repository.interface';

/**
 * specs/0209-desacoplar-integracoes-cnpj-plataforma — endpoint público (ADR-3 de specs/0201: não
 * é dado sensível nem específico de restaurante, precisa estar disponível antes até do login, ex.
 * pra montar a tela de checkout). App cliente e retaguarda leem os mesmos valores daqui pra
 * esconder Asaas subconta/Mercado Pago/iFood/99Food/Cartão de Crédito Online, cada um pelo seu
 * próprio switch (antes era um switch único, `cnpjIntegrationsEnabled`, specs/0201).
 *
 * (ajuste 10/11/2026, pedido explícito do usuário) — mesmo endpoint também devolve
 * `kdsAppEnabled`/`comandaAppEnabled`/`totemAppEnabled`, pros respectivos apps (mobbs-delivery-kds/
 * -comanda/-totem) se autoverificarem no boot, mesmo princípio dos switches acima.
 *
 * (ajuste 11/11/2026, pedido explícito do usuário) — mais um campo, `instagramAutomationEnabled`,
 * usado pelo menu lateral da retaguarda (`nav-items.tsx`) pra liberar "Automação Instagram".
 *
 * (ajuste 11/11/2026, pedido explícito do usuário, follow-up) — tag "Novo" no menu: mais campos
 * `<switch>IsNew`, `true` só nos primeiros 30 dias (ajuste 13/11/2026, pedido explícito do
 * usuário — era 10 dias) depois do switch correspondente ter virado `true`
 * (`PlatformConfigSnapshot.<switch>EnabledAt`, carimbado pelo script de ativação). Depois da
 * janela (ou se o switch nunca foi ativado/está desligado), some pra sempre — reativar reinicia a
 * contagem (novo carimbo a cada ativação, pedido explícito do usuário). Calculado aqui (não no
 * repositório) porque é regra de apresentação do menu, não do domínio do switch em si.
 */
const NEW_TAG_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function isNew(enabled: boolean, enabledAt: Date | undefined): boolean {
  if (!enabled || !enabledAt) return false;
  return Date.now() - new Date(enabledAt).getTime() < NEW_TAG_WINDOW_MS;
}

export class PlatformConfigController extends BaseRouter {
  constructor(private readonly platformConfigRepository: IPlatformConfigRepository) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.get('/platform/config', async (_req: Request, res: Response) => {
      const snapshot = await this.platformConfigRepository.getSnapshot();
      res.json(200, {
        asaasIntegrationEnabled: snapshot.asaasIntegrationEnabled,
        asaasIntegrationIsNew: isNew(snapshot.asaasIntegrationEnabled, snapshot.asaasIntegrationEnabledAt),
        mercadoPagoIntegrationEnabled: snapshot.mercadoPagoIntegrationEnabled,
        mercadoPagoIntegrationIsNew: isNew(snapshot.mercadoPagoIntegrationEnabled, snapshot.mercadoPagoIntegrationEnabledAt),
        ifoodIntegrationEnabled: snapshot.ifoodIntegrationEnabled,
        ifoodIntegrationIsNew: isNew(snapshot.ifoodIntegrationEnabled, snapshot.ifoodIntegrationEnabledAt),
        ninetyNineFoodIntegrationEnabled: snapshot.ninetyNineFoodIntegrationEnabled,
        ninetyNineFoodIntegrationIsNew: isNew(snapshot.ninetyNineFoodIntegrationEnabled, snapshot.ninetyNineFoodIntegrationEnabledAt),
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
