import { monthKeyOf, monthRange, priceCents, tierRank } from '../../../billing/domain/billing';
import { addCalendarYear, addDaysCorridos, localMidnight, previousMonthKey } from '../billing-calendar';
import type { IAnnualSubscription } from '../entities/annual-subscription.entity';
import type { ISubscriptionObligation } from '../entities/subscription-obligation.entity';
import type { IAnnualSubscriptionRepository } from '../repositories/annual-subscription.repository.interface';
import type { ISubscriptionObligationRepository } from '../repositories/subscription-obligation.repository.interface';
import { CloseMonthlyBillingService } from './close-monthly-billing.service';

export class AnnualAdhesionAlreadyActiveError extends Error {
  constructor() {
    super('Este restaurante já tem uma assinatura anual ativa.');
    this.name = 'AnnualAdhesionAlreadyActiveError';
  }
}

/**
 * specs/0175-cobranca-assinatura-asaas REQ-13..REQ-17 — adesão/renovação/cancelamento do ciclo
 * anual. Nunca chama o Asaas diretamente (emissão real do Pix é sempre
 * `ObligationIssuanceService`, igual às obligations mensais) — aqui só decide/congela o que vai
 * ser cobrado.
 */
export class AnnualSubscriptionService {
  constructor(
    private readonly deps: {
      annualSubscriptionRepository: IAnnualSubscriptionRepository;
      obligationRepository: ISubscriptionObligationRepository;
      closeMonthlyBillingService: CloseMonthlyBillingService;
    },
  ) {}

  /** REQ-13/AC-7 — adesão: piso Pro (decisão 3), faixa do mês CORRENTE (até agora, não o mês
   * fechado), preço fixo até a véspera do aniversário seguinte. Fecha também o trecho mensal
   * restante do mês de adesão (REQ-17/AC-13) — dias 1 até a véspera da adesão, sob mensal. */
  async subscribe(restaurantId: string, now: Date): Promise<{ subscription: IAnnualSubscription; obligation: ISubscriptionObligation }> {
    const existing = await this.deps.annualSubscriptionRepository.findActiveByRestaurantId(restaurantId);
    if (existing) throw new AnnualAdhesionAlreadyActiveError();

    const joinedAt = localMidnight(now);
    const month = monthKeyOf(now);
    const { start: monthStart } = monthRange(month);
    const { tier: currentTier, settingsVersion } = await this.deps.closeMonthlyBillingService.evaluateRevenueTier(restaurantId, monthStart, joinedAt, now);
    // Decisão 3 — piso Pro pra adesão anual voluntária vinda do Gratuito.
    const tier = tierRank(currentTier) < tierRank('pro') ? 'pro' : currentTier;
    const amountCents = priceCents(tier, 'annual', settingsVersion);

    const subscription = await this.deps.annualSubscriptionRepository.create(restaurantId, joinedAt);
    const obligation = await this.deps.obligationRepository.upsertAnnual({
      restaurantId,
      kind: 'annual-initial',
      coveragePeriod: { start: joinedAt, end: addCalendarYear(joinedAt) },
      tier,
      settingsVersionId: settingsVersion.id,
      amountCents,
      dueDate: addDaysCorridos(joinedAt, 10),
    });

    // REQ-17/AC-13 — trecho mensal de 01 até a véspera da adesão (0 dias se aderir no dia 1).
    if (joinedAt.getTime() > monthStart.getTime()) {
      await this.deps.closeMonthlyBillingService.closeProratedMonthlySegment(restaurantId, month, monthStart, joinedAt);
    }

    return { subscription, obligation };
  }

  /** REQ-15/AC-9/AC-10 — renovação no aniversário: faixa do ÚLTIMO MÊS COMPLETO anterior ao
   * aniversário (nunca o mês corrente, ainda em curso), com piso Pro também (é a MESMA assinatura
   * anual continuando, nunca um valor abaixo de Pro). Idempotente (`upsertAnnual`) — chamar de
   * novo pro mesmo aniversário nunca duplica nem estende a cobertura pela data do pagamento. */
  async issueRenewalIfDue(subscription: IAnnualSubscription, now: Date): Promise<ISubscriptionObligation | null> {
    if (!subscription.renewalActive) return null;

    const obligations = await this.deps.obligationRepository.findByRestaurantId(subscription.restaurantId);
    const annualObligations = obligations.filter((obligation) => obligation.kind === 'annual-initial' || obligation.kind === 'annual-renewal');
    const latestCoverageEnd = annualObligations.reduce<Date | null>((latest, obligation) => {
      const end = obligation.coveragePeriod?.end;
      if (!end) return latest;
      return !latest || end.getTime() > latest.getTime() ? end : latest;
    }, null);
    if (!latestCoverageEnd) return null; // nunca deveria faltar — a adesão sempre cria o primeiro.

    const nextAnniversary = latestCoverageEnd;
    if (now.getTime() < nextAnniversary.getTime()) return null; // ainda não chegou o aniversário.

    const referenceMonth = previousMonthKey(monthKeyOf(nextAnniversary));
    const { start, end } = monthRange(referenceMonth);
    const { tier: revenueTier, settingsVersion } = await this.deps.closeMonthlyBillingService.evaluateRevenueTier(subscription.restaurantId, start, end, nextAnniversary);
    const tier = tierRank(revenueTier) < tierRank('pro') ? 'pro' : revenueTier;
    const amountCents = priceCents(tier, 'annual', settingsVersion);

    return this.deps.obligationRepository.upsertAnnual({
      restaurantId: subscription.restaurantId,
      kind: 'annual-renewal',
      coveragePeriod: { start: nextAnniversary, end: addCalendarYear(nextAnniversary) },
      tier,
      settingsVersionId: settingsVersion.id,
      amountCents,
      dueDate: addDaysCorridos(nextAnniversary, 10),
    });
  }

  /** REQ-16/AC-11 — cancela só a RENOVAÇÃO: a cobertura já paga (`coveragePeriod` congelado na
   * obligation) continua valendo até o fim, sem estorno automático. A volta ao mensal, a partir
   * do fim da cobertura, é tratada pelo fechamento mensal de rotina (que volta a fechar
   * normalmente qualquer mês fora de uma cobertura anual ativa) — nenhuma ação adicional aqui. */
  async cancelRenewal(subscription: IAnnualSubscription, now: Date, cancelledBy: string): Promise<IAnnualSubscription> {
    return this.deps.annualSubscriptionRepository.cancelRenewal(subscription.id, now, cancelledBy);
  }

  /**
   * REQ-16/AC-12 — desistência de um anual AINDA NÃO PAGO: cancela a obligation localmente
   * (quem chama já cuidou de cancelar/confirmar a cobrança no Asaas antes — ver
   * `PlatformBillingController`, que reconcilia primeiro pra nunca confirmar desistência de um
   * título já pago) e desliga a renovação. "Recompor mensal desde a adesão" fica a cargo do
   * próximo fechamento mensal de rotina: sem obligation anual ativa cobrindo o período, o mês
   * corrente volta a fechar normalmente (cenário real: desistência sempre ocorre no MESMO mês,
   * ainda em curso, da própria adesão — nunca depois do mês já ter fechado).
   */
  async withdrawUnpaidAnnual(subscription: IAnnualSubscription, obligation: ISubscriptionObligation, now: Date, actor: string): Promise<void> {
    await this.deps.obligationRepository.markCancelled(obligation.id);
    await this.deps.annualSubscriptionRepository.cancelRenewal(subscription.id, now, actor);
  }
}
