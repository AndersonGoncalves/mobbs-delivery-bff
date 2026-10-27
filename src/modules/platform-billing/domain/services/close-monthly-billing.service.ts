import { computeBillingTier, monthlyPriceCents, monthRange, priceCents, sumRevenueCents } from '../../../billing/domain/billing';
import { daysInMonth, proratedCents } from '../billing-calendar';
import type { IBillingSettingsVersion } from '../entities/billing-settings-version.entity';
import type { ISubscriptionObligation } from '../entities/subscription-obligation.entity';
import type { IBillingSettingsVersionRepository } from '../repositories/billing-settings-version.repository.interface';
import type { ISubscriptionObligationRepository } from '../repositories/subscription-obligation.repository.interface';

export interface CloseMonthlyBillingOrderRepository {
  findDeliveredByRestaurantBetween(restaurantId: string, start: Date, end: Date): Promise<{ total: number }[]>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * specs/0175-cobranca-assinatura-asaas REQ-6/REQ-7/REQ-8/REQ-17 — fecha uma competência mensal
 * (ou um trecho proporcional dela, no mês de uma transição mensal↔anual), congelando
 * receita/faixa/versão/valor na obligation — nunca recalculados por reajuste posterior (AC-4).
 * Idempotente via `upsertMonthly` (upsert por `restaurantId`+`kind`+`referenceMonth` — chamar de
 * novo pro mesmo mês/restaurante devolve a MESMA obligation, sem reabrir o cálculo).
 */
export class CloseMonthlyBillingService {
  constructor(
    private readonly deps: {
      orderRepository: CloseMonthlyBillingOrderRepository;
      obligationRepository: ISubscriptionObligationRepository;
      settingsVersionRepository: IBillingSettingsVersionRepository;
    },
  ) {}

  /** Vencimento comercial de uma competência mensal: dia 10 do mês seguinte (decisão 1). */
  monthlyDueDate(month: string): Date {
    const [year, monthNumber] = month.split('-').map(Number);
    const dueMonth = monthNumber === 12 ? 1 : monthNumber + 1;
    const dueYear = monthNumber === 12 ? year + 1 : year;
    return new Date(Date.UTC(dueYear, dueMonth - 1, 10, 3));
  }

  private async requireSettingsVersion(date: Date): Promise<IBillingSettingsVersion> {
    const version = await this.deps.settingsVersionRepository.currentAt(date);
    if (!version) {
      throw new Error('Nenhuma versão de configuração de cobrança vigente para esta data — a migração de ativação (T028) não rodou ainda.');
    }
    return version;
  }

  /** Receita/faixa/versão de um intervalo, SEM persistir obligation nenhuma — reaproveitado por
   * `closeMonth`/`closeProratedMonthlySegment` e por quem precisa só calcular (ex.
   * `AnnualSubscriptionService`, pra achar a faixa do "último mês completo anterior ao
   * aniversário" na renovação, REQ-15, sem fechar uma competência mensal separada por isso). */
  async evaluateRevenueTier(restaurantId: string, start: Date, end: Date, settingsAsOf: Date): Promise<{ revenueCents: number; tier: ISubscriptionObligation['tier']; settingsVersion: IBillingSettingsVersion }> {
    const settingsVersion = await this.requireSettingsVersion(settingsAsOf);
    const orders = await this.deps.orderRepository.findDeliveredByRestaurantBetween(restaurantId, start, end);
    const revenueCents = sumRevenueCents(orders);
    const tier = computeBillingTier(revenueCents, settingsVersion);
    return { revenueCents, tier, settingsVersion };
  }

  /** Fecha a competência inteira do mês (`month`, `YYYY-MM`) — REQ-6/AC-3. A versão de
   * configuração considerada é a vigente no FIM da competência, nunca a atual (REQ-8/AC-4). */
  async closeMonth(restaurantId: string, month: string): Promise<ISubscriptionObligation> {
    const { start, end } = monthRange(month);
    const { revenueCents, tier, settingsVersion } = await this.evaluateRevenueTier(restaurantId, start, end, end);
    const amountCents = priceCents(tier, 'monthly', settingsVersion);

    return this.deps.obligationRepository.upsertMonthly({
      restaurantId,
      kind: 'monthly',
      referenceMonth: month,
      tier,
      settingsVersionId: settingsVersion.id,
      revenueCentsUsed: revenueCents,
      amountCents,
      status: amountCents === 0 ? 'exempt' : 'awaiting_issue',
      dueDate: this.monthlyDueDate(month),
    });
  }

  /**
   * REQ-17/AC-13 — fecha o TRECHO mensal de um mês com transição mensal↔anual: `segmentStart`
   * (inclusive) até `segmentEndExclusive` são os dias efetivamente sob mensal (nunca um dia já
   * coberto pelo anual, decisão da "Transições sem sobreposição"). Receita/faixa vêm só do
   * TRECHO (nunca do mês inteiro — pode render uma faixa diferente da do mês completo).
   */
  async closeProratedMonthlySegment(restaurantId: string, month: string, segmentStart: Date, segmentEndExclusive: Date): Promise<ISubscriptionObligation> {
    const { end: monthEnd } = monthRange(month);
    const { revenueCents, tier, settingsVersion } = await this.evaluateRevenueTier(restaurantId, segmentStart, segmentEndExclusive, monthEnd);
    const monthlyPrice = monthlyPriceCents(tier, settingsVersion);

    const [year, monthNumber] = month.split('-').map(Number);
    const daysInMonthValue = daysInMonth(year, monthNumber - 1);
    const daysUnderMonthly = Math.round((segmentEndExclusive.getTime() - segmentStart.getTime()) / DAY_MS);
    const amountCents = proratedCents(monthlyPrice, daysUnderMonthly, daysInMonthValue);

    return this.deps.obligationRepository.upsertMonthly({
      restaurantId,
      kind: 'monthly-prorated',
      referenceMonth: month,
      tier,
      settingsVersionId: settingsVersion.id,
      revenueCentsUsed: revenueCents,
      amountCents,
      roundingDetail: { daysUnderMonthly, daysInMonth: daysInMonthValue },
      status: amountCents === 0 ? 'exempt' : 'awaiting_issue',
      dueDate: this.monthlyDueDate(month),
    });
  }
}
