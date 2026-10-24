import { ICashRegisterSession } from './entities/cash-register.entity';

/** Caixa segue a mesma data civil de São Paulo usada no horário do restaurante. */
export function cashRegisterDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)!.value).join('-');
}

export function cashRegisterDayBounds(date: string) {
  const from = new Date(`${date}T00:00:00-03:00`);
  return { from, to: new Date(from.getTime() + 86_400_000) };
}

export function cashRegisterPeriodEnd(session: ICashRegisterSession, now = new Date()): Date {
  if (session.accountingEndAt) return new Date(session.accountingEndAt);
  const end = session.closedAt ? new Date(session.closedAt) : now;
  // Fechamentos legados continuam com o período original; não reclassificar o histórico.
  if (session.closedAt && !session.businessDate) return end;
  const { to } = cashRegisterDayBounds(session.businessDate ?? cashRegisterDate(new Date(session.openedAt)));
  return new Date(Math.min(end.getTime(), to.getTime()));
}
