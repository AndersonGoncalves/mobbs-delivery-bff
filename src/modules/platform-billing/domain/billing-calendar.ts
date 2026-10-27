/**
 * specs/0175-cobranca-assinatura-asaas — funções puras de calendário/arredondamento. Todas
 * recebem `now`/datas como parâmetro explícito (nunca leem o relógio do sistema), condição
 * explícita do REQ-36/ponto 9 do plano — testáveis com data fixa.
 *
 * Mesma convenção de fuso de `billing/domain/billing.ts` (`monthKeyOf`/`monthRange`): Brasília é
 * UTC-3 fixo, sem horário de verão desde 2019. `localMidnight` normaliza qualquer instante pro
 * `Date` UTC que representa meia-noite de Brasília daquele dia (`Date.UTC(y, m, d, 3)` — mesma
 * codificação de `monthRange(...).start`), pra que todo cálculo de calendário abaixo opere só
 * sobre `getUTC*()` sem se preocupar de novo com o deslocamento de fuso.
 */
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function localMidnight(date: Date): Date {
  const local = new Date(date.getTime() - BRASILIA_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 3));
}

export function addDaysCorridos(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/**
 * Soma 1 ano de calendário a uma data normalizada por `localMidnight`. 29/02 num ano
 * não-bissexto vira 28/02 (AC-10) — a REFERÊNCIA (dia/mês originais de `joinedAt`) nunca é
 * perdida: quem chama sempre passa o `joinedAt` original (ou o aniversário anterior, que já
 * preserva dia/mês 29/02 quando o ano em questão é bissexto), nunca um 28/02 persistido como se
 * fosse a data de adesão.
 */
export function addCalendarYear(date: Date): Date {
  const year = date.getUTCFullYear() + 1;
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const resolvedDay = month === 1 && day === 29 && !isLeapYear(year) ? 28 : day;
  return new Date(Date.UTC(year, month, resolvedDay, 3));
}

/** Arredondamento único pra centavos (REQ-17/AC-13: R$ 79,90 × 23/31 = R$ 59,28). */
export function proratedCents(monthlyPriceCents: number, daysUnderMonthly: number, daysInMonthValue: number): number {
  if (daysUnderMonthly <= 0) return 0;
  return Math.round((monthlyPriceCents * daysUnderMonthly) / daysInMonthValue);
}

/** Dias sob mensal no mês em que a cobertura anual COMEÇA — do dia 1 até a véspera da adesão,
 * inclusive (adesão em 24/10 → 23 dias, 01 a 23/10). */
export function monthlyDaysBeforeAnnualStart(annualStartLocalMidnight: Date): number {
  return annualStartLocalMidnight.getUTCDate() - 1;
}

/** Dias sob mensal no mês em que a cobertura anual TERMINA (cancelamento/fim de cobertura) — do
 * dia da volta ao mensal até o fim do mês, inclusive. */
export function monthlyDaysFromAnnualEnd(annualEndLocalMidnight: Date): number {
  const year = annualEndLocalMidnight.getUTCFullYear();
  const month = annualEndLocalMidnight.getUTCMonth();
  return daysInMonth(year, month) - annualEndLocalMidnight.getUTCDate() + 1;
}

/** `YYYY-MM` do mês de calendário imediatamente anterior — usado pela renovação anual (REQ-15:
 * "faixa do último mês COMPLETO anterior ao aniversário", nunca o mês do próprio aniversário). */
export function previousMonthKey(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const previousMonth = monthNumber === 1 ? 12 : monthNumber - 1;
  const previousYear = monthNumber === 1 ? year - 1 : year;
  return `${previousYear}-${String(previousMonth).padStart(2, '0')}`;
}

/** Lista de competências `YYYY-MM` desde `fromMonth` (inclusive) até `toMonthExclusive`
 * (exclusive) — usada pelo sweep (REQ-9) pra achar as competências já fechadas e elegíveis desde
 * a ativação, sem gerar a do mês ainda em curso. */
export function monthsBetween(fromMonth: string, toMonthExclusive: string): string[] {
  const months: string[] = [];
  let [year, month] = fromMonth.split('-').map(Number);
  while (`${year}-${String(month).padStart(2, '0')}` < toMonthExclusive) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/** A versão de configuração vigente numa data — a mais recente com `effectiveFrom <= date`
 * (REQ-8/AC-4: nunca aplica uma versão reajustada DEPOIS da data em questão). `null` só se não
 * houver nenhuma versão com `effectiveFrom` nessa data ou antes (não deveria ocorrer depois da
 * migração de ativação, que sempre cria a versão 1). */
export function settingsEffectiveAt<T extends { effectiveFrom: Date }>(date: Date, versions: T[]): T | null {
  const applicable = versions.filter((version) => version.effectiveFrom.getTime() <= date.getTime());
  if (applicable.length === 0) return null;
  return applicable.reduce((latest, version) => (version.effectiveFrom.getTime() > latest.effectiveFrom.getTime() ? version : latest));
}
