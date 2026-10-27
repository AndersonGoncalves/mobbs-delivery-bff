import { localMidnight } from './billing-calendar';
import type { ISubscriptionObligation, SubscriptionObligationStatus } from './entities/subscription-obligation.entity';
import type { IPixAvailabilityException } from './entities/pix-availability-exception.entity';

export interface AccessStatus {
  status: 'ok' | 'blocked';
  cycle: 'monthly' | 'annual';
}

/** Única nunca-bloqueia: isenta (sem dívida), cancelada (voidada antes de existir dívida de
 * verdade) ou paga. Estorno total/parcial volta a abrir saldo devido (REQ-23 "reabre o saldo
 * devido"/"mantém o saldo remanescente") — por isso NÃO estão aqui, e caem no cálculo de
 * vencimento abaixo como qualquer outra dívida em aberto. */
const NEVER_BLOCKS: ReadonlySet<SubscriptionObligationStatus> = new Set(['exempt', 'cancelled', 'paid']);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * specs/0175-cobranca-assinatura-asaas REQ-21/REQ-24/REQ-25/REQ-27 — deriva `status`/`cycle` de
 * `Restaurant.billing` a partir da totalidade das obligations e exceções vigentes, em vez de um
 * campo escrito à mão. Chamada depois de todo evento relevante (webhook, reconciliação,
 * cancelamento, reprocessamento administrativo, fechamento de competência).
 *
 * REQ-27/AC-21 (substitui a isenção de `specs/0042` AC-8, ver `spec.md` "Relação com regras
 * anteriores") — a faixa Gratuito CORRENTE não protege contra dívida de uma competência paga
 * anterior ou de um anual voluntário não pago: a antiga regra "gratuito nunca bloqueia" media só
 * a faixa do mês em curso, nunca uma dívida real; aqui o bloqueio é sempre por dívida real, nunca
 * por faixa — `isBillingBlocked` (`billing/domain/billing.ts`) foi corrigida nesta spec pra não
 * mais isentar pela faixa corrente.
 *
 * AC-18 — o corte é à MEIA-NOITE do dia seguinte ao vencimento (23:59:59 do dia do vencimento
 * ainda está no prazo), nunca no instante exato do vencimento.
 */
export function recomputeAccessStatus(
  obligations: ISubscriptionObligation[],
  exceptions: IPixAvailabilityException[],
  now: Date,
): AccessStatus {
  const exceptionByObligationId = new Map(exceptions.map((exception) => [exception.obligationId, exception]));

  const hasBlockingDebt = obligations.some((obligation) => {
    if (obligation.amountCents <= 0) return false; // isenção nunca gera dívida, mesmo com status diferente de 'exempt' por engano.
    if (NEVER_BLOCKS.has(obligation.status)) return false;

    const startOfDayAfterDueDate = new Date(localMidnight(obligation.dueDate).getTime() + DAY_MS);
    const exception = exceptionByObligationId.get(obligation.id);
    // REQ-10 — a exceção de 3 dias desloca só o CORTE de bloqueio, nunca a dívida financeira
    // exibida (que continua sendo `obligation.dueDate`, inalterada).
    const cutoff = exception ? Math.max(startOfDayAfterDueDate.getTime(), exception.graceDeadline.getTime()) : startOfDayAfterDueDate.getTime();
    return now.getTime() >= cutoff;
  });

  const activeAnnualCoverage = obligations.find(
    (obligation) =>
      (obligation.kind === 'annual-initial' || obligation.kind === 'annual-renewal') &&
      obligation.status === 'paid' &&
      obligation.coveragePeriod !== undefined &&
      obligation.coveragePeriod.start.getTime() <= now.getTime() &&
      now.getTime() < obligation.coveragePeriod.end.getTime(),
  );

  return {
    status: hasBlockingDebt ? 'blocked' : 'ok',
    cycle: activeAnnualCoverage ? 'annual' : 'monthly',
  };
}
