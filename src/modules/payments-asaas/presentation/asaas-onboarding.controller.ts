import { randomBytes } from 'crypto';
import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { environment } from '../../../shared/config/environment';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { AsaasClient } from '../infra/asaas-client';
import { createAsaasSubaccountSchema } from './asaas-onboarding.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0101-integracao-asaas (fase 1) — cadastro da subconta Asaas de um restaurante (KYC),
 * restrito a dono/gerente (mesma restrição de `/settings/*`). A chave da subconta
 * (`accessToken.apiKey`) só vem UMA VEZ na resposta do Asaas — por isso é persistida aqui dentro,
 * nunca devolvida de volta pra retaguarda (mesmo cuidado de `autoPrintApiKey`/
 * `paymentWebhookApiKey`).
 */
export class AsaasOnboardingController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
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

    application.post('/restaurants/me/asaas/subaccount', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const input = parseBody(createAsaasSubaccountSchema, req.body);

      if (!environment.asaas.apiKey) {
        throw new Error('ASAAS_API_KEY não configurada — cobrança via Asaas indisponível até a chave da conta mãe ser definida.');
      }

      const webhookToken = randomBytes(24).toString('hex');
      const webhookUrl = `${environment.server.publicBaseUrl}/webhooks/asaas/${req.restaurantId}`;

      const platformClient = new AsaasClient(environment.asaas.apiKey, environment.asaas.baseUrl);
      const subaccount = await platformClient.createSubaccount(input, webhookUrl, webhookToken);

      await this.restaurantRepository.saveAsaasSubaccount(req.restaurantId!, {
        asaasAccountId: subaccount.id,
        asaasWalletId: subaccount.walletId,
        asaasApiKey: subaccount.apiKey,
        asaasWebhookToken: webhookToken,
      });

      // Nunca devolve `asaasApiKey`/`webhookToken` — só confirmação de que a subconta existe.
      res.json(200, { onlinePaymentsEnabled: true, asaasAccountId: subaccount.id });
    });
  }
}
