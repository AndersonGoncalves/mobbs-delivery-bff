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

/**
 * Pedido explícito do usuário (follow-up, achado real 06/11/2026) — até aqui, o período de uma
 * sessão ainda aberta ficava travado na meia-noite (fim civil) da data em que ela abriu, mesmo
 * com o restaurante continuando a vender depois disso (ex. delivery entregue às 2h da manhã) ou o
 * operador só fechando o caixa de verdade horas depois (ex. 9h do dia seguinte). Pedido/pagamento
 * recebido nesse intervalo — depois da meia-noite, antes do fechamento manual — não entrava em
 * NENHUMA sessão: tarde demais pra de ontem (já passou do teto), cedo demais pra uma de hoje
 * (ninguém abre a próxima enquanto a de ontem não fechar) — dinheiro sumia da conferência.
 *
 * Mudança: o período de uma sessão é sempre a vida real dela — do `openedAt` até o fechamento
 * manual de verdade (`closedAt`/`accountingEndAt`), sem teto de meia-noite nem de data civil.
 * Sessão aberta soma tudo até agora, por mais tarde que o operador feche. Substitui a regra da
 * spec 0176 (`cashRegisterDate(session.openedAt) !== cashRegisterDate()`), que resolvia vazamento
 * de venda pra sessão errada mas causava este bug — a invariante "só um caixa aberto por vez"
 * (`open()`/`ensureAutomaticSchedule`) já garante que não existe sessão errada pra vazar: só pode
 * haver a sessão aberta, então tudo que acontece enquanto ela está aberta pertence a ela.
 */
export function cashRegisterPeriodEnd(session: ICashRegisterSession, now = new Date()): Date {
  if (session.accountingEndAt) return new Date(session.accountingEndAt);
  if (session.closedAt) return new Date(session.closedAt);
  return now;
}
