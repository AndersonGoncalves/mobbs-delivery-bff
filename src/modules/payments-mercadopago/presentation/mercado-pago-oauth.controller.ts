import type { Request, Response, Server } from 'restify';
import { ConflictError, ForbiddenError, ServiceUnavailableError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { environment } from '../../../shared/config/environment';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import type { IPaymentRepository } from '../../orders/domain/repositories/payment.repository.interface';
import type { IPlatformConfigRepository } from '../../platform-config/domain/platform-config.repository.interface';
import { MercadoPagoClient } from '../infra/mercado-pago-client';
import { mercadoPagoOAuthCallbackSchema } from './mercado-pago-oauth.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0170-integracao-mercado-pago (REQ-1) — recebe o `code` devolvido pelo Mercado Pago no
 * redirect OAuth (a retaguarda já validou `state` contra o `sessionStorage` antes de chamar
 * aqui, ver plan.md), troca por `access_token`/`refresh_token` e persiste no restaurante.
 * Restrito a dono/gerente, mesma restrição de `/settings/*` e `AsaasOnboardingController`.
 * `access_token`/`refresh_token` nunca são devolvidos na resposta — mesmo cuidado de
 * `asaasApiKey`.
 */
export class MercadoPagoOAuthController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
    // specs/0226 REQ-A15 — bloqueia o "Desvincular" com pagamento do Mercado Pago pendente.
    private readonly paymentRepository: IPaymentRepository,
    // specs/0201-controle-integracoes-cnpj-plataforma — opcional só pra não quebrar composição/
    // testes existentes que não injetam; em produção é sempre passado (ver main.ts).
    private readonly platformConfigRepository?: IPlatformConfigRepository,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const operatorAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono'),
    ];

    application.get('/restaurants/me/mercadopago/config', ...operatorAuthenticated, async (_req: Request, res: Response) => {
      // specs/0226 REQ-A4 — `MERCADOPAGO_PLATFORM_ACCESS_TOKEN` não é mais exigido: o webhook
      // consulta o pagamento com o token do restaurante.
      const { clientId, clientSecret, redirectUri, webhookSecret } = environment.mercadoPago;
      const missing = [
        ...(!clientId || !/^\d+$/.test(clientId) ? ['MERCADOPAGO_CLIENT_ID (Application ID numérico)'] : []),
        ...(!clientSecret ? ['MERCADOPAGO_CLIENT_SECRET'] : []),
        ...(!isValidRedirectUri(redirectUri) ? ['MERCADOPAGO_REDIRECT_URI (URL HTTPS de callback)'] : []),
      ];
      res.json(200, {
        configured: missing.length === 0,
        clientId: clientId ?? '',
        redirectUri: redirectUri ?? '',
        missing,
        paymentMissing: [
          ...(!webhookSecret ? ['MERCADOPAGO_WEBHOOK_SECRET'] : []),
        ],
      });
    });

    application.post('/restaurants/me/mercadopago/callback', ...operatorAuthenticated, async (req: Request, res: Response) => {
      // specs/0209-desacoplar-integracoes-cnpj-plataforma (substitui specs/0201 REQ-2/ADR-1) —
      // defesa em profundidade, switch próprio do Mercado Pago, independente do Asaas.
      if (this.platformConfigRepository && !(await this.platformConfigRepository.isMercadoPagoIntegrationEnabled())) {
        throw new ForbiddenError('Integração com Mercado Pago indisponível no momento');
      }
      const input = parseBody(mercadoPagoOAuthCallbackSchema, req.body);

      if (!environment.mercadoPago.clientId || !/^\d+$/.test(environment.mercadoPago.clientId) ||
          !environment.mercadoPago.clientSecret || !isValidRedirectUri(environment.mercadoPago.redirectUri)) {
        throw new ServiceUnavailableError('Configure MERCADOPAGO_CLIENT_ID (Application ID numérico), MERCADOPAGO_CLIENT_SECRET e MERCADOPAGO_REDIRECT_URI (HTTPS) no BFF.');
      }

      const client = new MercadoPagoClient(environment.mercadoPago.clientId, environment.mercadoPago.clientSecret, environment.mercadoPago.baseUrl);
      const tokens = await client.exchangeCodeForToken(input.code, environment.mercadoPago.redirectUri, input.codeVerifier, environment.mercadoPago.testToken);

      const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
      await this.restaurantRepository.saveMercadoPagoTokens(req.restaurantId!, {
        mercadoPagoAccessToken: tokens.accessToken,
        mercadoPagoRefreshToken: tokens.refreshToken,
        mercadoPagoUserId: tokens.userId,
        mercadoPagoTokenExpiresAt: expiresAt,
      });

      // Nunca devolve os tokens — só confirmação de que o vínculo foi feito.
      res.json(200, { mercadoPagoLinked: true, mercadoPagoUserId: tokens.userId });
    });

    // specs/0226 REQ-A15 — o restaurante desvincula a própria conta. Recusa (409) enquanto houver
    // pedido aberto com Pix/cartão do Mercado Pago pendente: depois de apagar o token, esse
    // pagamento não seria mais confirmado nem cancelado sozinho. Não chama o Mercado Pago (não há
    // endpoint de revogação simples; a autorização pode ser removida pela própria conta).
    application.del('/restaurants/me/mercadopago', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const pendingOrderNumbers = await this.paymentRepository.findOpenOrderNumbersWithPendingMercadoPagoPayment(req.restaurantId!);
      if (pendingOrderNumbers.length > 0) {
        const list = pendingOrderNumbers.map((orderNumber) => `#${orderNumber}`).join(', ');
        throw new ConflictError(
          `Há pedidos com pagamento pelo Mercado Pago ainda pendente (${list}). Aguarde o pagamento ou cancele esses pedidos antes de desvincular.`,
        );
      }
      await this.restaurantRepository.disconnectMercadoPago(req.restaurantId!);
      res.send(204);
    });
  }

}

function isValidRedirectUri(value: string | undefined): value is string {
  if (!value || !URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash &&
    url.pathname === '/painel/settings/mercadopago/callback';
}
