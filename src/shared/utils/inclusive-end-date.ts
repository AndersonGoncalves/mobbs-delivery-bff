const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * specs/0231-filtro-datas-contas-pedidos-compra — limite final INCLUSIVO de um filtro de período
 * (`to`). Data pura (`YYYY-MM-DD`) vira o último instante daquele dia em UTC, senão um `to` puro
 * em `createdAt` (timestamp de verdade) cortaria o dia inteiro; data com horário (ISO completo,
 * ex. o fim do dia LOCAL que a web já manda convertido pra UTC) é usada como veio.
 */
export function toInclusiveEndDate(value: string): Date {
  return DATE_ONLY.test(value) ? new Date(`${value}T23:59:59.999Z`) : new Date(value);
}

/** `true` quando `from` é posterior a `to` (comparando `to` já como limite inclusivo). */
export function isReversedRange(from: string | undefined, to: string | undefined): boolean {
  if (!from || !to) return false;
  return new Date(from).getTime() > toInclusiveEndDate(to).getTime();
}
