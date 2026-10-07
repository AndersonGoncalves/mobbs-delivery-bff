import type { IRestaurant, IRestaurantBilling } from '../../restaurants/domain/entities/restaurant.entity';

/**
 * specs/0042-controle-cobranca-planos — faixas de plano por faturamento mensal (sem gateway: o status é
 * marcado manualmente, `scripts/set-billing-status.ts`). Valores em centavos.
 *
 * specs/0113-parametrizacao-faixas-cobranca — os valores deixam de ser constantes fixas: ficam em
 * `BillingSettings`, persistido (`IBillingSettingsRepository`) e editável pelo painel da
 * plataforma, com `DEFAULT_BILLING_SETTINGS` valendo até a primeira configuração. Toda função que
 * depende de limite/mensalidade recebe `settings` como último parâmetro, com esse default — quem
 * calcula de verdade (controllers/use case) busca o valor atual antes de chamar.
 */
export type BillingTier = IRestaurantBilling['currentTier'];
export type BillingCycle = IRestaurantBilling['cycle'];

export interface BillingSettings {
  /** Limite superior (centavos) da faixa Gratuita — passou daqui, sobe pra Pro. */
  freeLimitCents: number;
  /** Limite superior (centavos) da faixa Pro — passou daqui, sobe pra Premium. */
  proLimitCents: number;
  proMonthlyPriceCents: number;
  premiumMonthlyPriceCents: number;
  /** Mensalidade × este número = valor do plano anual ("N meses grátis"). */
  annualMultiplier: number;
}

/** specs/0113 — valores vigentes a partir de 2026-10-07 (Pro: R$ 7.000/R$ 79,90; demais mantidos). */
export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  freeLimitCents: 200_000,
  proLimitCents: 700_000,
  proMonthlyPriceCents: 7_990,
  premiumMonthlyPriceCents: 11_990,
  annualMultiplier: 10,
};

const TIER_RANK: Record<BillingTier, number> = { free: 0, pro: 1, premium: 2 };
const TIER_LABEL: Record<BillingTier, string> = { free: 'Gratuito', pro: 'Pro', premium: 'Premium' };

/** Faixa pelo faturamento do mês. Passar do limite (estritamente) sobe de faixa. */
export function computeBillingTier(revenueCents: number, settings: BillingSettings = DEFAULT_BILLING_SETTINGS): BillingTier {
  if (revenueCents > settings.proLimitCents) return 'premium';
  if (revenueCents > settings.freeLimitCents) return 'pro';
  return 'free';
}

/** Limite (centavos) de uma faixa paga/gratuita — Premium não tem teto, por isso não entra aqui. */
export function tierLimitCents(tier: 'free' | 'pro', settings: BillingSettings = DEFAULT_BILLING_SETTINGS): number {
  return tier === 'free' ? settings.freeLimitCents : settings.proLimitCents;
}

/** Aviso de "perto do limite": 75% do limite da faixa atual (percentual não é parametrizável, ver plan.md). */
export function warningAtCents(tier: 'free' | 'pro', settings: BillingSettings = DEFAULT_BILLING_SETTINGS): number {
  return Math.round(tierLimitCents(tier, settings) * 0.75);
}

/** Mensalidade de uma faixa. Plano gratuito não tem cobrança. */
export function monthlyPriceCents(tier: BillingTier, settings: BillingSettings = DEFAULT_BILLING_SETTINGS): number {
  if (tier === 'free') return 0;
  return tier === 'pro' ? settings.proMonthlyPriceCents : settings.premiumMonthlyPriceCents;
}

/** Mensalidade que vale pro ciclo (mensal ou anual). Plano gratuito não tem cobrança. */
export function priceCents(tier: BillingTier, cycle: BillingCycle, settings: BillingSettings = DEFAULT_BILLING_SETTINGS): number {
  const monthly = monthlyPriceCents(tier, settings);
  return cycle === 'annual' ? monthly * settings.annualMultiplier : monthly;
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
export function buildWarningMessage(tier: 'free' | 'pro', revenueCents: number, settings: BillingSettings = DEFAULT_BILLING_SETTINGS): string {
  const next = tier === 'free' ? 'Pro' : 'Premium';
  return `⚠️ Seu faturamento deste mês chegou a ${formatBRL(revenueCents)}, perto do limite de ${formatBRL(tierLimitCents(tier, settings))} do plano ${TIER_LABEL[tier]}. Ao ultrapassar, o plano ${next} passa a valer.`;
}

/** Texto comemorativo de subida de faixa. */
export function buildUpgradeMessage(tier: BillingTier, settings: BillingSettings = DEFAULT_BILLING_SETTINGS): string {
  const monthly = formatBRL(priceCents(tier, 'monthly', settings));
  const annual = formatBRL(priceCents(tier, 'annual', settings));
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
