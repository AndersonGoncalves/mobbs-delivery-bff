import type { Request, Response, Server } from 'restify';
import { ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole, requireOwnerRole } from '../../../shared/http/require-operator-role.middleware';
import { computeBillingTier, monthKeyOf, monthRange, priceCents, sumRevenueCents } from '../../billing/domain/billing';
import type { IBillingSettingsRepository } from '../../billing/domain/repositories/billing-settings.repository.interface';
import { recomputeAccessStatus } from '../domain/recompute-access-status';
import type { IAnnualSubscriptionRepository } from '../domain/repositories/annual-subscription.repository.interface';
import type { IPixAvailabilityExceptionRepository } from '../domain/repositories/pix-availability-exception.repository.interface';
import type { ISubscriptionObligationRepository } from '../domain/repositories/subscription-obligation.repository.interface';
import type { IBillingPayerRepository } from '../domain/repositories/billing-payer.repository.interface';
import type { AnnualSubscriptionService } from '../domain/services/annual-subscription.service';
import { AnnualAdhesionAlreadyActiveError } from '../domain/services/annual-subscription.service';
import type { BillingPayerService } from '../domain/services/billing-payer.service';
import type { ReconciliationService } from '../domain/services/reconciliation.service';
import { completeBillingPayerSchema } from './platform-billing.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/** Papéis que veem dado financeiro (REQ-33) — mesmo critério de Caixa/relatórios já usado em
 * `AsaasOnboardingController` (saldo/repasses). Garçom/Motoboy nunca chegam aqui. */
const FINANCIAL_ROLES = ['dono', 'gerente', 'financeiro'] as const;

/**
 * specs/0175-cobranca-assinatura-asaas REQ-26/REQ-30/REQ-33 — API da retaguarda pro LOJISTA
 * (dono/gerente/financeiro): simulação de planos, resumo/histórico, completar pagador, Pix e
 * verificação de pagamento, contratar/cancelar anual. Usa um `restaurantOperatorMiddleware`
 * **sem** o check de billing-block (injetado sem `restaurantRepository` — ver `main.ts`): REQ-26
 * exige que o lojista BLOQUEADO continue conseguindo acessar exatamente estas rotas pra se
 * regularizar — o middleware padrão (`shared/http/restaurant-operator.middleware.ts`, usado por
 * toda a retaguarda) lançaria `BillingBlockedError` antes de chegar aqui.
 */
export class PlatformBillingController extends BaseRouter {
  constructor(
    private readonly deps: {
      restaurantOperatorMiddlewareWithoutBillingGuard: AsyncHandler;
      billingSettingsRepository: IBillingSettingsRepository;
      billingPayerRepository: IBillingPayerRepository;
      obligationRepository: ISubscriptionObligationRepository;
      annualSubscriptionRepository: IAnnualSubscriptionRepository;
      pixAvailabilityExceptionRepository: IPixAvailabilityExceptionRepository;
      billingPayerService: BillingPayerService;
      annualSubscriptionService: AnnualSubscriptionService;
      reconciliationService: ReconciliationService;
      orderRepository: { findDeliveredByRestaurantBetween(restaurantId: string, start: Date, end: Date): Promise<{ total: number }[]> };
    },
  ) {
    super();
  }

  private async requireOwnObligation(restaurantId: string, obligationId: string) {
    const obligation = await this.deps.obligationRepository.findById(obligationId);
    if (!obligation || obligation.restaurantId !== restaurantId) throw new NotFoundError('Fatura não encontrada');
    return obligation;
  }

  /** A obligation anual "corrente" de uma assinatura ativa — a de `coveragePeriod.start` mais
   * recente entre as não canceladas, usada pra decidir contratar/cancelar/verificar Pix. */
  private async findCurrentAnnualObligation(restaurantId: string) {
    const obligations = await this.deps.obligationRepository.findByRestaurantId(restaurantId);
    const annual = obligations.filter((o) => (o.kind === 'annual-initial' || o.kind === 'annual-renewal') && o.status !== 'cancelled');
    if (annual.length === 0) return null;
    return annual.reduce((latest, o) => (o.coveragePeriod!.start.getTime() > latest.coveragePeriod!.start.getTime() ? o : latest));
  }

  initializeRoutes(application: Server): void {
    const financialAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.deps.restaurantOperatorMiddlewareWithoutBillingGuard,
      requireOperatorRole(...FINANCIAL_ROLES),
    ];
    const ownerAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.deps.restaurantOperatorMiddlewareWithoutBillingGuard,
      requireOwnerRole(),
    ];

    // REQ-28/AC-22 — simulação (planos/valores atuais, nunca congelados: é pra decidir, não uma
    // fatura emitida).
    application.get('/restaurants/me/billing/plans', ...financialAuthenticated, async (req: Request, res: Response) => {
      const settings = await this.deps.billingSettingsRepository.get();
      const now = new Date();
      const month = monthKeyOf(now);
      const { start } = monthRange(month);
      const orders = await this.deps.orderRepository.findDeliveredByRestaurantBetween(req.restaurantId!, start, now);
      const revenueCents = sumRevenueCents(orders);
      const currentTier = computeBillingTier(revenueCents, settings);

      res.json(200, {
        settings,
        current: { tier: currentTier, revenueCents },
        tiers: [
          { tier: 'free', monthlyPriceCents: 0, annualPriceCents: 0 },
          { tier: 'pro', monthlyPriceCents: settings.proMonthlyPriceCents, annualPriceCents: priceCents('pro', 'annual', settings) },
          { tier: 'premium', monthlyPriceCents: settings.premiumMonthlyPriceCents, annualPriceCents: priceCents('premium', 'annual', settings) },
        ],
      });
    });

    // REQ-29/REQ-30 — resumo pra badge/aviso do menu e pra página de regularização.
    application.get('/restaurants/me/billing/summary', ...financialAuthenticated, async (req: Request, res: Response) => {
      const restaurantId = req.restaurantId!;
      const now = new Date();
      const [payer, openObligations, subscription] = await Promise.all([
        this.deps.billingPayerRepository.findByRestaurantId(restaurantId),
        this.deps.obligationRepository.findOpenByRestaurantId(restaurantId),
        this.deps.annualSubscriptionRepository.findActiveByRestaurantId(restaurantId),
      ]);
      const exceptions = (
        await Promise.all(openObligations.map((o) => this.deps.pixAvailabilityExceptionRepository.findByObligationId(o.id)))
      ).filter((exception): exception is NonNullable<typeof exception> => exception !== null);
      const accessStatus = recomputeAccessStatus(openObligations, exceptions, now);

      res.json(200, { payer, openObligations, annualSubscription: subscription, accessStatus });
    });

    // REQ-32 (histórico completo, não só o em aberto) — mesmo critério financeiro de acesso.
    application.get('/restaurants/me/billing/invoices', ...financialAuthenticated, async (req: Request, res: Response) => {
      const obligations = await this.deps.obligationRepository.findByRestaurantId(req.restaurantId!);
      res.json(200, obligations);
    });

    // REQ-3/REQ-4 — só o Dono completa/corrige o cadastro do pagador (REQ-33).
    application.post('/restaurants/me/billing/payer', ...ownerAuthenticated, async (req: Request, res: Response) => {
      const input = parseBody(completeBillingPayerSchema, req.body);
      const payer = await this.deps.billingPayerService.completePayer(req.restaurantId!, input, new Date());
      res.json(200, payer);
    });

    // REQ-18/REQ-30 — dados do Pix de uma fatura específica (nunca por `:id` de outro restaurante).
    application.get('/restaurants/me/billing/invoices/:id/pix', ...financialAuthenticated, async (req: Request, res: Response) => {
      const obligation = await this.requireOwnObligation(req.restaurantId!, req.params.id);
      res.json(200, { pixPayload: obligation.pixPayload, amountCents: obligation.amountCents, dueDate: obligation.dueDate, status: obligation.status });
    });

    // REQ-22 — "verificar pagamento" sob demanda; nunca declara quitação sem confirmar com o Asaas.
    application.post('/restaurants/me/billing/invoices/:id/verify', ...financialAuthenticated, async (req: Request, res: Response) => {
      const obligation = await this.requireOwnObligation(req.restaurantId!, req.params.id);
      await this.deps.reconciliationService.reconcile(new Date(), { obligationId: obligation.id });
      const refreshed = await this.deps.obligationRepository.findById(obligation.id);
      res.json(200, refreshed);
    });

    // REQ-13/AC-7 — só o Dono contrata (REQ-33).
    application.post('/restaurants/me/billing/annual/subscribe', ...ownerAuthenticated, async (req: Request, res: Response) => {
      try {
        const { obligation } = await this.deps.annualSubscriptionService.subscribe(req.restaurantId!, new Date());
        res.json(201, obligation);
      } catch (error) {
        if (error instanceof AnnualAdhesionAlreadyActiveError) throw new ConflictError(error.message);
        throw error;
      }
    });

    // REQ-16/AC-11/AC-12 — um único endpoint de "cancelar": reconcilia primeiro (nunca confirma
    // cancelamento de título já pago, AC-12) e decide sozinho se é "cancelar renovação" (paga,
    // mantém acesso até o fim) ou "desistência" (nunca paga, recompõe mensal) — o Dono só vê
    // "cancelar assinatura anual", sem precisar saber qual caso interno se aplica.
    application.post('/restaurants/me/billing/annual/cancel', ...ownerAuthenticated, async (req: Request, res: Response) => {
      const restaurantId = req.restaurantId!;
      const subscription = await this.deps.annualSubscriptionRepository.findActiveByRestaurantId(restaurantId);
      if (!subscription) throw new NotFoundError('Nenhuma assinatura anual ativa pra este restaurante');
      const currentObligation = await this.findCurrentAnnualObligation(restaurantId);
      if (!currentObligation) throw new NotFoundError('Nenhuma obrigação anual encontrada pra esta assinatura');

      const now = new Date();
      await this.deps.reconciliationService.reconcile(now, { obligationId: currentObligation.id });
      const refreshed = await this.deps.obligationRepository.findById(currentObligation.id);
      const actor = req.user!.email!;

      if (refreshed?.status === 'paid') {
        const updated = await this.deps.annualSubscriptionService.cancelRenewal(subscription, now, actor);
        res.json(200, { kind: 'renewal_cancelled', subscription: updated, accessUntil: refreshed.coveragePeriod?.end });
      } else {
        await this.deps.annualSubscriptionService.withdrawUnpaidAnnual(subscription, refreshed!, now, actor);
        res.json(200, { kind: 'withdrawn' });
      }
    });
  }
}
