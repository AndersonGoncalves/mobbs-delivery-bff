import type { IRestaurant, IRestaurantBilling } from '../../restaurants/domain/entities/restaurant.entity';

/**
 * specs/0042-controle-cobranca-planos — faixas de plano por faturamento mensal (sem gateway: o status é
 * marcado manualmente, `scripts/set-billing-status.ts`). Valores em centavos.
 */
export type BillingTier = IRestaurantBilling['currentTier'];
export type BillingCycle = IRestaurantBilling['cycle'];

/** Limite superior de cada faixa paga/gratuita: passou daqui, sobe de faixa. */
export const TIER_LIMIT_CENTS: Record<'free' | 'pro', number> = { free: 200000, pro: 800000 };

/** Aviso de "perto do limite" (75% do limite da faixa atual). */
export const WARNING_AT_CENTS: Record<'free' | 'pro', number> = { free: 150000, pro: 600000 };

/** Mensalidade por faixa. Anual = 10× a mensal ("2 meses grátis"). */
export const MONTHLY_PRICE_CENTS: Record<BillingTier, number> = { free: 0, pro: 6990, premium: 11990 };
export const ANNUAL_MULTIPLIER = 10;

const TIER_RANK: Record<BillingTier, number> = { free: 0, pro: 1, premium: 2 };
const TIER_LABEL: Record<BillingTier, string> = { free: 'Gratuito', pro: 'Pro', premium: 'Premium' };

/** Faixa pela faturamento do mês. Passar do limite (estritamente) sobe de faixa. */
export function computeBillingTier(revenueCents: number): BillingTier {
  if (revenueCents > TIER_LIMIT_CENTS.pro) return 'premium';
  if (revenueCents > TIER_LIMIT_CENTS.free) return 'pro';
  return 'free';
}

/** Mensalidade que vale pro ciclo (mensal ou anual). Plano gratuito não tem cobrança. */
export function priceCents(tier: BillingTier, cycle: BillingCycle): number {
  const monthly = MONTHLY_PRICE_CENTS[tier];
  return cycle === 'annual' ? monthly * ANNUAL_MULTIPLIER : monthly;
}

/**
 * Bloqueio por inadimplência (REQ-7/REQ-8): só vale quando o status é `blocked` e a faixa não é a gratuita —
 * restaurante no gratuito nunca é bloqueado, mesmo com o status marcado por engano.
 */
export function isBillingBlocked(billing: IRestaurantBilling | undefined): boolean {
  return billing?.status === 'blocked' && billing.currentTier !== 'free';
}

/** Mês de referência `YYYY-MM` no fuso de Brasília (UTC-3, sem horário de verão desde 2019). */
export function monthKeyOf(now: Date): string {
  const local = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Intervalo [início, fim) do mês em Brasília, como `Date` UTC. */
export function monthRange(month: string): { start: Date; end: Date } {
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1, 3)),
    end: new Date(Date.UTC(year, monthNumber, 1, 3)),
  };
}

/** Soma o faturamento (em centavos) dos pedidos entregues. Cancelados/em andamento nunca entram aqui. */
export function sumRevenueCents(orders: { total: number }[]): number {
  return orders.reduce((sum, order) => sum + Math.round(order.total * 100), 0);
}

export function formatBRL(cents: number): string {
  // Intl põe espaço não separável entre R$ e o valor; mensagem de WhatsApp usa espaço comum.
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100).replace(/\u00a0/g, ' ');
}

/** Texto do aviso de 75% do limite. Enviado uma única vez por mês. */
export function buildWarningMessage(tier: 'free' | 'pro', revenueCents: number): string {
  const next = tier === 'free' ? 'Pro' : 'Premium';
  return `⚠️ Seu faturamento deste mês chegou a ${formatBRL(revenueCents)}, perto do limite de ${formatBRL(TIER_LIMIT_CENTS[tier])} do plano ${TIER_LABEL[tier]}. Ao ultrapassar, o plano ${next} passa a valer.`;
}

/** Texto comemorativo de subida de faixa. */
export function buildUpgradeMessage(tier: BillingTier): string {
  const monthly = formatBRL(priceCents(tier, 'monthly'));
  const annual = formatBRL(priceCents(tier, 'annual'));
  return `🎉 Parabéns! Seu faturamento deste mês passou do limite e seu restaurante agora está no plano ${TIER_LABEL[tier]}. Mensalidade: ${monthly}/mês (ou ${annual}/ano no plano anual).`;
}

export function tierRank(tier: BillingTier): number {
  return TIER_RANK[tier];
}

export function tierLabel(tier: BillingTier): string {
  return TIER_LABEL[tier];
}

/** Restaurante sem faturamento calculado ainda equivale ao estado inicial (gratuito, sem avisos). */
export function defaultBilling(month: string): IRestaurantBilling {
  return { referenceMonth: month, currentTier: 'free', notified75Percent: false, notifiedTierUpgrade: false, status: 'ok', cycle: 'monthly' };
}

export type { IRestaurant };
