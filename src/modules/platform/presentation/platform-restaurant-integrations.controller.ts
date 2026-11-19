import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { parseBody } from '../../../shared/http/validate';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IFiscalConfigRepository } from '../../fiscal-integration/domain/repositories/fiscal-config.repository.interface';
import { saveFiscalConfigSchema } from '../../fiscal-integration/presentation/fiscal-config.schemas';
import { toPublicView as toPublicFiscalView } from '../../fiscal-integration/presentation/fiscal-config.controller';
import { IUberDeliveryConfigRepository } from '../../uber-direct-integration/domain/repositories/uber-delivery-config.repository.interface';
import { saveUberDeliveryConfigSchema } from '../../uber-direct-integration/presentation/uber-delivery-config.schemas';
import { toPublicView as toPublicUberDirectView } from '../../uber-direct-integration/presentation/uber-delivery-config.controller';
import { saveIFoodCredentialsSchema } from '../../ifood-integration/presentation/ifood-onboarding.schemas';
import {
  adminOverrideAsaasSchema,
  adminOverrideMercadoPagoSchema,
  adminOverrideNinetyNineFoodSchema,
} from './platform-restaurant-integrations.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * Pedido explícito do usuário (18/11/2026) — "tela de suporte": o admin da plataforma edita, de
 * qualquer restaurante, as mesmas credenciais de integração que hoje só o dono do restaurante
 * edita (`IFoodOnboardingController`/`FiscalConfigController`/`UberDeliveryConfigController`/
 * `NinetyNineFoodOnboardingController`/`MercadoPagoOAuthController`/`AsaasOnboardingController`),
 * sem precisar logar como o restaurante. Reaproveita os MESMOS repositórios/métodos de domínio
 * que essas rotas — a única diferença real é de onde vem o `restaurantId` (`:id` da URL, não da
 * sessão do operador) e quem pode chamar (`platformAdminMiddleware`, não
 * `requireOperatorRole('dono')`).
 *
 * iFood/FocusNFe/Uber Direct já são digitados à mão pelo próprio operador normalmente — aqui é
 * o mesmo formulário, só que preenchido pelo suporte. 99Food/Mercado Pago/Asaas normalmente só
 * recebem credencial via fluxo OAuth/criação de subconta (nunca digitados) — aqui o suporte
 * grava manualmente o resultado de uma autorização feita fora do mobbs (ver
 * `platform-restaurant-integrations.schemas.ts`).
 *
 * Pedido explícito do usuário (18/11/2026, 2ª leva) — Instagram entrou também, mas só com DEL
 * (forçar desconexão): é 100% OAuth (consentimento do próprio dono da conta Instagram), nunca
 * teve nem terá um campo pra digitar à mão, então não tem PUT igual aos outros.
 *
 * Sem log de auditoria nesta primeira versão (quem mexeu, quando, em qual campo) — fica como
 * follow-up razoável; combinado nesta sessão não ser escopo desta tarefa.
 */
export class PlatformRestaurantIntegrationsController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly fiscalConfigRepository: IFiscalConfigRepository,
    private readonly uberDeliveryConfigRepository: IUberDeliveryConfigRepository,
    private readonly platformAdminMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const adminAuthenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.platformAdminMiddleware];

    async function requireRestaurant(restaurantRepository: IRestaurantRepository, id: string) {
      const restaurant = await restaurantRepository.findById(id);
      if (!restaurant) throw new NotFoundError('Restaurante não encontrado');
      return restaurant;
    }

    application.get('/platform/restaurants/:id/integrations', ...adminAuthenticated, async (req: Request, res: Response) => {
      const restaurant = await requireRestaurant(this.restaurantRepository, req.params.id);
      const [fiscalConfig, uberDeliveryConfig] = await Promise.all([
        this.fiscalConfigRepository.findByRestaurantId(restaurant.id),
        this.uberDeliveryConfigRepository.findByRestaurantId(restaurant.id),
      ]);

      // Mesma máscara de `toOperatorRestaurant` (nenhum segredo bruto volta, só confirmação de
      // vínculo) — ver `restaurant-serializers.ts`.
      res.json(200, {
        restaurantName: restaurant.name,
        restaurantSlug: restaurant.slug,
        ifood: {
          connected: Boolean(restaurant.ifoodConnectedAt),
          ifoodMerchantId: restaurant.ifoodMerchantId ?? null,
          ifoodClientId: restaurant.ifoodClientId ?? null,
          ifoodConnectedAt: restaurant.ifoodConnectedAt ?? null,
        },
        fiscal: toPublicFiscalView(fiscalConfig),
        uberDirect: toPublicUberDirectView(uberDeliveryConfig),
        ninetyNineFood: {
          connected: Boolean(restaurant.ninetyNineFoodConnectedAt),
          ninetyNineFoodAppShopId: restaurant.ninetyNineFoodAppShopId ?? null,
          ninetyNineFoodConnectedAt: restaurant.ninetyNineFoodConnectedAt ?? null,
          ninetyNineFoodAuthorizationPendingAt: restaurant.ninetyNineFoodAuthorizationPendingAt ?? null,
        },
        mercadoPago: {
          connected: Boolean(restaurant.mercadoPagoAccessToken),
          mercadoPagoUserId: restaurant.mercadoPagoUserId ?? null,
          mercadoPagoTokenExpiresAt: restaurant.mercadoPagoTokenExpiresAt ?? null,
        },
        asaas: {
          connected: Boolean(restaurant.asaasAccountId),
          onlinePaymentsEnabled: restaurant.onlinePaymentsEnabled ?? false,
          asaasAccountId: restaurant.asaasAccountId ?? null,
          asaasWalletId: restaurant.asaasWalletId ?? null,
        },
        // Pedido explícito do usuário (18/11/2026, 2ª leva) — mesma lógica de "força a
        // desconexão pra restaurante poder reconectar" já usada pra iFood/99Food/Asaas: a
        // credencial em si (`instagramAccessToken`) é só via OAuth (nunca digitada, nem pelo
        // próprio dono) — sem outro campo seguro pra expor aqui além do status e do username
        // decorativo (`instagramAccessToken` nunca sai numa resposta de API, mesma regra de
        // `toOperatorRestaurant`).
        instagram: {
          connected: Boolean(restaurant.instagramAccountId),
          instagramUsername: restaurant.instagramUsername ?? null,
        },
      });
    });

    application.put('/platform/restaurants/:id/integrations/ifood', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      const input = parseBody(saveIFoodCredentialsSchema, req.body);
      await this.restaurantRepository.saveIFoodCredentials(req.params.id, input);
      res.json(200, { ifoodMerchantId: input.ifoodMerchantId, connected: true });
    });

    application.del('/platform/restaurants/:id/integrations/ifood', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      await this.restaurantRepository.disconnectIFood(req.params.id);
      res.send(204);
    });

    application.put('/platform/restaurants/:id/integrations/fiscal', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      const input = parseBody(saveFiscalConfigSchema, req.body);
      const config = await this.fiscalConfigRepository.upsert(req.params.id, input);
      res.json(200, toPublicFiscalView(config));
    });

    application.del('/platform/restaurants/:id/integrations/fiscal', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      await this.fiscalConfigRepository.delete(req.params.id);
      res.send(204);
    });

    application.put('/platform/restaurants/:id/integrations/uber-direct', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      const input = parseBody(saveUberDeliveryConfigSchema, req.body);
      const config = await this.uberDeliveryConfigRepository.upsert(req.params.id, input);
      res.json(200, toPublicUberDirectView(config));
    });

    application.del('/platform/restaurants/:id/integrations/uber-direct', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      await this.uberDeliveryConfigRepository.delete(req.params.id);
      res.send(204);
    });

    application.put('/platform/restaurants/:id/integrations/99food', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      const input = parseBody(adminOverrideNinetyNineFoodSchema, req.body);
      await this.restaurantRepository.saveNinetyNineFoodBinding(req.params.id, input);
      res.json(200, { ninetyNineFoodAppShopId: input.appShopId, connected: true });
    });

    application.del('/platform/restaurants/:id/integrations/99food', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      await this.restaurantRepository.disconnectNinetyNineFood(req.params.id);
      res.send(204);
    });

    // Sem DEL aqui — o Mercado Pago nunca teve uma rota de "desvincular" nem pro próprio
    // restaurante (`MercadoPagoOAuthController` só tem o callback OAuth, ver domínio), então a
    // tela de suporte também não ganha uma só pra este override manual.
    application.put('/platform/restaurants/:id/integrations/mercadopago', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      const input = parseBody(adminOverrideMercadoPagoSchema, req.body);
      await this.restaurantRepository.saveMercadoPagoTokens(req.params.id, input);
      res.json(200, { mercadoPagoUserId: input.mercadoPagoUserId, connected: true });
    });

    application.put('/platform/restaurants/:id/integrations/asaas', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      const input = parseBody(adminOverrideAsaasSchema, req.body);
      await this.restaurantRepository.adminOverrideAsaasCredentials(req.params.id, input);
      res.json(200, { asaasAccountId: input.asaasAccountId, connected: true });
    });

    application.del('/platform/restaurants/:id/integrations/asaas', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      await this.restaurantRepository.disconnectAsaasSubaccount(req.params.id);
      res.send(204);
    });

    // Sem PUT — Instagram só conecta via OAuth de verdade (consentimento do próprio dono da
    // conta Instagram), nunca por credencial digitada; o único override seguro é forçar a
    // desconexão pra ele reconectar do zero.
    application.del('/platform/restaurants/:id/integrations/instagram', ...adminAuthenticated, async (req: Request, res: Response) => {
      await requireRestaurant(this.restaurantRepository, req.params.id);
      await this.restaurantRepository.clearInstagramConnection(req.params.id);
      res.send(204);
    });
  }
}
