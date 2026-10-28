import { randomBytes } from 'crypto';
import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { environment } from '../../../shared/config/environment';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { AsaasClient } from '../infra/asaas-client';
import { createAsaasSubaccountSchema, reconnectAsaasSubaccountSchema, savePixTransferKeySchema } from './asaas-onboarding.schemas';

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

      // Achado real (pedido explícito do usuário) — se já existe uma subconta vinculada antes
      // (mesmo que "desvinculada" agora), reconecta sem chamar o Asaas de novo: tentar CRIAR
      // outra com o mesmo CPF/e-mail falharia com "já está em uso" — a subconta antiga nunca é
      // apagada no Asaas quando o operador desvincula (ver `disconnectAsaasSubaccount`). Salva
      // `input` como `asaasSubaccountData` mesmo nesse caminho — necessário pra restaurantes
      // vinculados ANTES desse campo existir (nunca tiveram `asaasSubaccountData` salvo) e,
      // de qualquer forma, reflete o que o operador acabou de digitar/conferir na tela.
      const existing = await this.restaurantRepository.findById(req.restaurantId!);
      if (existing?.asaasAccountId) {
        await this.restaurantRepository.reactivateAsaasSubaccount(req.restaurantId!, input);
        res.json(200, { onlinePaymentsEnabled: true, asaasAccountId: existing.asaasAccountId });
        return;
      }

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
        subaccountData: input,
      });

      // Nunca devolve `asaasApiKey`/`webhookToken` — só confirmação de que a subconta existe.
      res.json(200, { onlinePaymentsEnabled: true, asaasAccountId: subaccount.id });
    });

    // Pedido explícito do usuário (follow-up) — "desvincular", mesmo padrão de
    // `DELETE /restaurants/me/whatsapp`: só pausa (ver `disconnectAsaasSubaccount` — NÃO apaga
    // credenciais), sem chamar o Asaas pra apagar nada lá (a subconta continua existindo lá, só
    // paramos de usá-la).
    application.del('/restaurants/me/asaas/subaccount', ...operatorAuthenticated, async (req: Request, res: Response) => {
      await this.restaurantRepository.disconnectAsaasSubaccount(req.restaurantId!);
      res.send(204);
    });

    // Pedido explícito do usuário (follow-up) — "esquecer" a subconta ATIVA (diferente de
    // desvincular, que mantém tudo pronto pra reconectar a MESMA subconta): deixa o formulário
    // em branco pra vincular uma conta Asaas diferente. Os dados não se perdem — são arquivados
    // em `previousAsaasSubaccounts`, restauráveis depois via `.../reconnect`.
    application.del('/restaurants/me/asaas/subaccount/forget', ...operatorAuthenticated, async (req: Request, res: Response) => {
      await this.restaurantRepository.forgetAsaasSubaccount(req.restaurantId!);
      res.send(204);
    });

    // Pedido explícito do usuário (follow-up) — restaura uma subconta arquivada por
    // `forgetAsaasSubaccount` (`previousAsaasSubaccounts`) de volta aos campos ativos, sem
    // chamar o Asaas de novo (mesmo espírito de "Reativar" sobre `disconnectAsaasSubaccount`).
    application.post('/restaurants/me/asaas/subaccount/reconnect', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const { asaasAccountId } = parseBody(reconnectAsaasSubaccountSchema, req.body);
      await this.restaurantRepository.reconnectPreviousAsaasSubaccount(req.restaurantId!, asaasAccountId);
      res.json(200, { onlinePaymentsEnabled: true, asaasAccountId });
    });

    // specs/0101-integracao-asaas (fase 2, REQ-7) — saldo/repasses são dado financeiro, mesmo
    // critério de acesso de Caixa/relatórios (`CAIXA_ROLES` na web: dono/gerente/financeiro),
    // mais largo que o KYC de cadastrar a subconta (só dono/gerente, acima).
    const financialAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente', 'financeiro'),
    ];

    application.get('/restaurants/me/asaas/balance', ...financialAuthenticated, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.restaurantId!);
      if (!restaurant?.asaasApiKey) {
        res.json(200, { balance: null });
        return;
      }
      const client = new AsaasClient(restaurant.asaasApiKey, environment.asaas.baseUrl);
      const { balance } = await client.getBalance();
      res.json(200, { balance });
    });

    application.get('/restaurants/me/asaas/transfers', ...financialAuthenticated, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.restaurantId!);
      if (!restaurant?.asaasApiKey) {
        res.json(200, { transfers: [] });
        return;
      }
      const client = new AsaasClient(restaurant.asaasApiKey, environment.asaas.baseUrl);
      const transfers = await client.listTransfers();
      res.json(200, { transfers });
    });

    // specs/0194-ajustes-menu-ajuda-assinatura-estoque REQ-10 — chave Pix de destino do repasse,
    // mesma restrição de acesso de saldo/repasses (financeiro incluso).
    application.post('/restaurants/me/asaas/transfer-pix-key', ...financialAuthenticated, async (req: Request, res: Response) => {
      const { pixAddressKey, pixAddressKeyType } = parseBody(savePixTransferKeySchema, req.body);
      await this.restaurantRepository.updateProfile(req.restaurantId!, {
        asaasTransferPixKey: pixAddressKey,
        asaasTransferPixKeyType: pixAddressKeyType,
      });
      res.json(200, { asaasTransferPixKey: pixAddressKey, asaasTransferPixKeyType: pixAddressKeyType });
    });

    // specs/0194-ajustes-menu-ajuda-assinatura-estoque REQ-10 — repassa SEMPRE o saldo total
    // disponível no momento (sem valor informado pelo operador, decisão confirmada com o usuário)
    // pra chave Pix já cadastrada acima.
    application.post('/restaurants/me/asaas/transfer', ...financialAuthenticated, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.restaurantId!);
      if (!restaurant?.asaasApiKey) {
        throw new Error('Subconta Asaas não conectada — conecte em Integrações > Asaas antes de transferir.');
      }
      if (!restaurant.asaasTransferPixKey || !restaurant.asaasTransferPixKeyType) {
        throw new Error('Cadastre a chave Pix de destino antes de transferir o saldo.');
      }
      const client = new AsaasClient(restaurant.asaasApiKey, environment.asaas.baseUrl);
      const { balance } = await client.getBalance();
      if (!balance || balance <= 0) {
        throw new Error('Saldo disponível insuficiente pra transferir.');
      }
      const transfer = await client.createTransfer(balance, restaurant.asaasTransferPixKey, restaurant.asaasTransferPixKeyType);
      res.json(200, { transfer });
    });
  }
}
