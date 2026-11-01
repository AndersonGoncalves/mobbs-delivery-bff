import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';
import { z } from 'zod';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { parseBody } from '../../../shared/http/validate';
import { paginationQuerySchema, resolvePagination } from '../../../shared/http/pagination';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IRestaurant, IRestaurantBilling } from '../../restaurants/domain/entities/restaurant.entity';
import { BillingSettings, computeBillingTier, defaultBilling, isBillingBlocked, monthKeyOf, monthRange, sumRevenueCents } from '../../billing/domain/billing';
import type { IBillingSettingsRepository } from '../../billing/domain/repositories/billing-settings.repository.interface';
import type { IAnnualSubscriptionRepository } from '../../platform-billing/domain/repositories/annual-subscription.repository.interface';
import type { IBillingPayerRepository } from '../../platform-billing/domain/repositories/billing-payer.repository.interface';
import type { IPixAvailabilityExceptionRepository } from '../../platform-billing/domain/repositories/pix-availability-exception.repository.interface';
import type { ISubscriptionEventRepository } from '../../platform-billing/domain/repositories/subscription-event.repository.interface';
import type { ISubscriptionObligationRepository } from '../../platform-billing/domain/repositories/subscription-obligation.repository.interface';
import type { ObligationIssuanceService } from '../../platform-billing/domain/services/obligation-issuance.service';
import type { PlatformBillingCycleService } from '../../platform-billing/domain/services/platform-billing-cycle.service';
import type { ReconciliationService } from '../../platform-billing/domain/services/reconciliation.service';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

// specs/0175-cobranca-assinatura-asaas — `cycle` saiu de propósito: REQ-17/"Relação com regras
// anteriores" substitui a troca administrativa livre de ciclo por contratação real (anual só
// existe via `IAnnualSubscription`, `PlatformBillingController`). `status` continua editável à
// mão como escape-hatch operacional (mesmo comportamento de specs/0106, nunca removido) — a
// exceção AUDITADA (motivo/autoria/prazo, REQ-32) é a rota nova `POST .../exceptions` abaixo.
const billingChangeSchema = z.object({ status: z.enum(['ok', 'blocked']) });

const manualExceptionSchema = z.object({
  obligationId: z.string().min(1),
  reason: z.string().min(1),
  graceDeadline: z.string().refine((value) => !Number.isNaN(Date.parse(value)), { message: 'Data inválida' }),
});

/** Achado de auditoria pré-produção (31/10/2026) — "'Restaurantes da plataforma' não pagina
 * nem filtra": `search`/`page`/`pageSize` OPCIONAIS — omitidos, devolve a lista inteira
 * exatamente como antes. */
const listPlatformRestaurantsQuerySchema = z.object({ search: z.string().min(1).optional() }).merge(paginationQuerySchema);

/** specs/0106 — linha do painel: um restaurante com o estado de cobrança do mês. */
export interface PlatformRestaurantRow {
  id: string;
  name: string;
  slug: string;
  tier: 'free' | 'pro' | 'premium';
  status: 'ok' | 'blocked';
  cycle: 'monthly' | 'annual';
  revenueCents: number;
  lastDeliveredAt: string | null;
  blocked: boolean;
}

/**
 * specs/0106 REQ-2/REQ-3/REQ-4 — painel da plataforma: lista de restaurantes e troca de status/ciclo.
 * Protegido por `platformAdminMiddleware` (REQ-1), que o chamador encadeia.
 */
export class PlatformController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly platformAdminMiddleware: AsyncHandler,
    // specs/0113-parametrizacao-faixas-cobranca.
    private readonly billingSettingsRepository: IBillingSettingsRepository,
    // specs/0175-cobranca-assinatura-asaas (REQ-31/REQ-32) — visão administrativa da assinatura.
    private readonly obligationRepository: ISubscriptionObligationRepository,
    private readonly annualSubscriptionRepository: IAnnualSubscriptionRepository,
    private readonly billingPayerRepository: IBillingPayerRepository,
    private readonly subscriptionEventRepository: ISubscriptionEventRepository,
    private readonly pixAvailabilityExceptionRepository: IPixAvailabilityExceptionRepository,
    private readonly platformBillingCycleService: PlatformBillingCycleService,
    private readonly obligationIssuanceService: ObligationIssuanceService,
    private readonly reconciliationService: ReconciliationService,
  ) {
    super();
  }

  private async buildRow(restaurant: IRestaurant, month: string, settings: BillingSettings): Promise<PlatformRestaurantRow> {
    const { start, end } = monthRange(month);
    const orders = await this.orderRepository.findDeliveredByRestaurantBetween(restaurant.id, start, end);
    const revenueCents = sumRevenueCents(orders);
    const lastDelivered = await this.orderRepository.findLastDeliveredAt(restaurant.id);
    return this.toRow(restaurant, month, settings, revenueCents, lastDelivered);
  }

  // Achado crítico de auditoria pré-produção (31/10/2026) — "painel da plataforma: 1 query
  // completa por restaurante + soma em JS": `GET /platform/restaurants` precisa da lista de
  // TODOS os restaurantes cadastrados, então usa as agregações em lote
  // (`getMonthlyRevenueCentsByRestaurant`/`getLastDeliveredAtByRestaurant`, 2 queries no TOTAL,
  // não 2 por restaurante) em vez de `buildRow` por restaurante. `buildRow` continua intacto —
  // ainda usado por `PATCH .../billing`, que só precisa de UM restaurante por chamada, onde o
  // N+1 não existe.
  private async buildRows(restaurants: IRestaurant[], month: string, settings: BillingSettings): Promise<PlatformRestaurantRow[]> {
    const { start, end } = monthRange(month);
    const [revenueByRestaurant, lastDeliveredByRestaurant] = await Promise.all([
      this.orderRepository.getMonthlyRevenueCentsByRestaurant(start, end),
      this.orderRepository.getLastDeliveredAtByRestaurant(),
    ]);
    return restaurants.map((restaurant) =>
      this.toRow(restaurant, month, settings, revenueByRestaurant.get(restaurant.id) ?? 0, lastDeliveredByRestaurant.get(restaurant.id) ?? null),
    );
  }

  private toRow(
    restaurant: IRestaurant,
    month: string,
    settings: BillingSettings,
    revenueCents: number,
    lastDelivered: Date | null,
  ): PlatformRestaurantRow {
    const billing = restaurant.billing ?? defaultBilling(month);
    return {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      tier: computeBillingTier(revenueCents, settings),
      status: billing.status,
      cycle: billing.cycle,
      revenueCents,
      lastDeliveredAt: lastDelivered ? lastDelivered.toISOString() : null,
      blocked: isBillingBlocked(restaurant.billing),
    };
  }

  initializeRoutes(application: Server): void {
    const adminAuthenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.platformAdminMiddleware];

    application.get('/platform/me', ...adminAuthenticated, async (req: Request, res: Response) => {
      res.json(200, { email: req.user!.email });
    });

    // Achado de auditoria pré-produção (31/10/2026) — "'Restaurantes da plataforma' não pagina
    // nem filtra": cenário direto de "500+ restaurantes cadastrados" — buscava todos de uma vez,
    // sempre. `search`/`page`/`pageSize` OPCIONAIS (ver `resolvePagination`) — omitidos, devolve
    // a lista inteira exatamente como antes; informados, pagina/filtra de verdade no servidor e
    // o total real vai no header `X-Total-Count`.
    application.get('/platform/restaurants', ...adminAuthenticated, async (req: Request, res: Response) => {
      const month = monthKeyOf(new Date());
      const settings = await this.billingSettingsRepository.get();
      const query = parseBody(listPlatformRestaurantsQuerySchema, req.query ?? {});
      const pagination = resolvePagination(query);
      if (!pagination) {
        const restaurants = await this.restaurantRepository.listAll();
        res.json(200, await this.buildRows(restaurants, month, settings));
        return;
      }
      const { items, total } = await this.restaurantRepository.listAllPage(pagination, query.search);
      res.header('X-Total-Count', String(total));
      res.json(200, await this.buildRows(items, month, settings));
    });

    application.patch('/platform/restaurants/:id/billing', ...adminAuthenticated, async (req: Request, res: Response) => {
      const change = parseBody(billingChangeSchema, req.body);
      const restaurant = await this.restaurantRepository.findById(req.params.id);
      if (!restaurant) throw new NotFoundError('Restaurante não encontrado');
      const month = monthKeyOf(new Date());
      const current: IRestaurantBilling = restaurant.billing ?? defaultBilling(month);
      const next: IRestaurantBilling = { ...current, status: change.status };
      const updated = await this.restaurantRepository.updateBilling(restaurant.id, next);
      const settings = await this.billingSettingsRepository.get();
      res.json(200, await this.buildRow(updated, month, settings));
    });

    // specs/0175-cobranca-assinatura-asaas REQ-31 — visão administrativa com dado de cobrança
    // real (dívida/pendência técnica), além do que `GET /platform/restaurants` já mostra. Sem
    // filtro no servidor de propósito: a lista já traz tudo (mesmo padrão de
    // `/platform/restaurants`, sem paginação) — a retaguarda web filtra/ordena via DataGrid.
    //
    // Achado de auditoria pré-produção (31/10/2026) — "painel administrativo da plataforma (1
    // query por restaurante cadastrado)": a correção anterior só cobriu `GET /platform/restaurants`
    // — esta rota irmã tinha o MESMO N+1 (`buildBillingRow` por restaurante, 2 queries cada).
    // `buildBillingRows` abaixo usa as 2 agregações em lote (2 queries no TOTAL).
    application.get('/platform/billing/restaurants', ...adminAuthenticated, async (_req: Request, res: Response) => {
      const restaurants = await this.restaurantRepository.listAll();
      res.json(200, await this.buildBillingRows(restaurants));
    });

    // REQ-32 — histórico completo (obligations + eventos de cada uma) de um restaurante.
    application.get('/platform/billing/restaurants/:id', ...adminAuthenticated, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.params.id);
      if (!restaurant) throw new NotFoundError('Restaurante não encontrado');

      const [payer, obligations, annualSubscription] = await Promise.all([
        this.billingPayerRepository.findByRestaurantId(restaurant.id),
        this.obligationRepository.findByRestaurantId(restaurant.id),
        this.annualSubscriptionRepository.findActiveByRestaurantId(restaurant.id),
      ]);
      const obligationsWithEvents = await Promise.all(
        obligations.map(async (obligation) => ({ ...obligation, events: await this.subscriptionEventRepository.listByObligation(obligation.id) })),
      );

      res.json(200, {
        restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug, billing: restaurant.billing },
        payer,
        annualSubscription,
        obligations: obligationsWithEvents,
      });
    });

    // REQ-32 — reprocessamento seguro de UM restaurante (emissão + reconciliação + recálculo de
    // acesso), reaproveitando exatamente a mesma lógica do sweep global, só com o escopo
    // restrito. Idempotente — chamar de novo nunca duplica nem reabre o que já está pago/isento.
    application.post('/platform/billing/restaurants/:id/reprocess', ...adminAuthenticated, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.params.id);
      if (!restaurant) throw new NotFoundError('Restaurante não encontrado');

      const now = new Date();
      await this.obligationIssuanceService.issuePending(now, restaurant.id);
      await this.reconciliationService.reconcile(now, { restaurantId: restaurant.id });
      await this.platformBillingCycleService.recomputeAndPersist(restaurant.id, now);

      res.json(200, { reprocessed: true });
    });

    // REQ-32 — exceção administrativa auditada: estende/cria a janela de carência
    // (`IPixAvailabilityException`) de UMA obligation específica, sempre com motivo/autoria
    // (REQ-32 "motivo, autoria, prazo"); nunca altera o pagamento real do Asaas. Recalcula o
    // acesso na hora (mesmo raciocínio do webhook, REQ-21) — a exceção não "desaparece no
    // próximo recálculo" porque fica persistida (`setAdminOverride`, sempre sobrescreve, nunca
    // é um no-op silencioso como `createIfAbsent`).
    application.post('/platform/billing/exceptions', ...adminAuthenticated, async (req: Request, res: Response) => {
      const input = parseBody(manualExceptionSchema, req.body);
      const obligation = await this.obligationRepository.findById(input.obligationId);
      if (!obligation) throw new NotFoundError('Obrigação não encontrada');

      const now = new Date();
      const graceDeadline = new Date(input.graceDeadline);
      await this.pixAvailabilityExceptionRepository.setAdminOverride(obligation.id, graceDeadline, now);
      await this.subscriptionEventRepository.append({
        obligationId: obligation.id,
        type: 'manual_exception',
        payload: { reason: input.reason, graceDeadline: input.graceDeadline },
        actor: req.user!.email!,
      });
      await this.platformBillingCycleService.recomputeAndPersist(obligation.restaurantId, now);

      res.json(200, { obligationId: obligation.id, graceDeadline });
    });
  }

  /**
   * specs/0175-cobranca-assinatura-asaas REQ-31 — linha enriquecida com dado de cobrança real
   * (dívida em aberto/pendência técnica), além do que `buildRow`/`buildRows` (specs/0106) já
   * mostram. Achado de auditoria pré-produção (31/10/2026) — "painel administrativo da
   * plataforma (1 query por restaurante cadastrado)": as 2 agregações em lote
   * (`getOpenSummaryByRestaurant`/`getActiveRestaurantIds`, 2 queries no TOTAL) substituem
   * `findOpenByRestaurantId`/`findActiveByRestaurantId` por restaurante.
   */
  private async buildBillingRows(restaurants: IRestaurant[]) {
    const [openSummaryByRestaurant, activeAnnualRestaurantIds] = await Promise.all([
      this.obligationRepository.getOpenSummaryByRestaurant(),
      this.annualSubscriptionRepository.getActiveRestaurantIds(),
    ]);
    return restaurants.map((restaurant) => {
      const openSummary = openSummaryByRestaurant.get(restaurant.id);
      // REQ-34/AC-25 — `cycle: 'annual'` legado (anterior a esta integração) sem
      // `IAnnualSubscription` real por trás nunca é convertido automaticamente; aparece aqui
      // como pendência pro administrador conferir manualmente.
      const hasLegacyAnnualConflict = restaurant.billing?.cycle === 'annual' && !activeAnnualRestaurantIds.has(restaurant.id);
      return {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        status: restaurant.billing?.status ?? 'ok',
        cycle: restaurant.billing?.cycle ?? 'monthly',
        openObligationsCount: openSummary?.openObligationsCount ?? 0,
        totalDueCents: openSummary?.totalDueCents ?? 0,
        hasPendingTechnicalIssue: openSummary?.hasPendingTechnicalIssue ?? false,
        hasLegacyAnnualConflict,
      };
    });
  }
}
