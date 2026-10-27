import { localMidnight } from './billing-calendar';
import { recomputeAccessStatus } from './recompute-access-status';
import type { ISubscriptionObligation } from './entities/subscription-obligation.entity';
import type { IPixAvailabilityException } from './entities/pix-availability-exception.entity';

function buildObligation(overrides: Partial<ISubscriptionObligation> = {}): ISubscriptionObligation {
  return {
    id: 'ob-1',
    restaurantId: 'r-1',
    kind: 'monthly',
    referenceMonth: '2026-10',
    tier: 'pro',
    settingsVersionId: 'v1',
    amountCents: 7990,
    status: 'pending',
    dueDate: localMidnight(new Date('2026-11-10T12:00:00Z')),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildException(overrides: Partial<IPixAvailabilityException> = {}): IPixAvailabilityException {
  return {
    id: 'exc-1',
    obligationId: 'ob-1',
    firstValidPixAvailableAt: new Date('2026-11-12T12:00:00Z'),
    graceDeadline: localMidnight(new Date('2026-11-15T12:00:00Z')),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('recomputeAccessStatus', () => {
  it('AC-18: 23:59:59 do dia do vencimento ainda está no prazo; 00:00 do dia seguinte bloqueia', () => {
    const obligation = buildObligation({ dueDate: localMidnight(new Date('2026-11-10T12:00:00Z')) });

    const stillOk = recomputeAccessStatus([obligation], [], new Date('2026-11-10T23:59:59-03:00'));
    expect(stillOk.status).toBe('ok');

    const nowBlocked = recomputeAccessStatus([obligation], [], new Date('2026-11-11T00:00:00-03:00'));
    expect(nowBlocked.status).toBe('blocked');
  });

  it('REQ-27/AC-21: Gratuito corrente sem dívida nenhuma nunca bloqueia', () => {
    const result = recomputeAccessStatus([], [], new Date('2026-11-11T00:00:00-03:00'));
    expect(result.status).toBe('ok');
  });

  it('AC-21: Gratuito corrente com fatura Pro antiga vencida continua bloqueando (dívida real, não faixa)', () => {
    const oldDebt = buildObligation({ tier: 'pro', dueDate: localMidnight(new Date('2026-09-10T00:00:00Z')), status: 'overdue' });
    const result = recomputeAccessStatus([oldDebt], [], new Date('2026-11-11T00:00:00-03:00'));
    expect(result.status).toBe('blocked');
  });

  it('isenção (amountCents 0) nunca bloqueia, mesmo com status diferente de exempt por engano', () => {
    const exempt = buildObligation({ amountCents: 0, status: 'pending', dueDate: localMidnight(new Date('2026-09-10T00:00:00Z')) });
    const result = recomputeAccessStatus([exempt], [], new Date('2026-11-11T00:00:00-03:00'));
    expect(result.status).toBe('ok');
  });

  it('obligation paga nunca bloqueia', () => {
    const paid = buildObligation({ status: 'paid', dueDate: localMidnight(new Date('2026-09-10T00:00:00Z')) });
    const result = recomputeAccessStatus([paid], [], new Date('2026-11-11T00:00:00-03:00'));
    expect(result.status).toBe('ok');
  });

  it('REQ-23: obligation totalmente estornada reabre o saldo devido (volta a bloquear)', () => {
    const refunded = buildObligation({ status: 'refunded', dueDate: localMidnight(new Date('2026-09-10T00:00:00Z')) });
    const result = recomputeAccessStatus([refunded], [], new Date('2026-11-11T00:00:00-03:00'));
    expect(result.status).toBe('blocked');
  });

  it('cancelada nunca bloqueia (voidada antes de dívida de verdade)', () => {
    const cancelled = buildObligation({ status: 'cancelled', dueDate: localMidnight(new Date('2026-09-10T00:00:00Z')) });
    const result = recomputeAccessStatus([cancelled], [], new Date('2026-11-11T00:00:00-03:00'));
    expect(result.status).toBe('ok');
  });

  it('REQ-10/AC-5: exceção de 3 dias desloca o corte de bloqueio sem alterar a dívida (dueDate continua a original)', () => {
    const obligation = buildObligation({ id: 'ob-1', dueDate: localMidnight(new Date('2026-11-10T12:00:00Z')), status: 'awaiting_issue' });
    const exception = buildException({ obligationId: 'ob-1', graceDeadline: localMidnight(new Date('2026-11-15T12:00:00Z')) });

    // Sem a exceção, já teria bloqueado em 11/11. Com ela, continua liberado até 15/11.
    const stillOkDueToException = recomputeAccessStatus([obligation], [exception], new Date('2026-11-12T00:00:00-03:00'));
    expect(stillOkDueToException.status).toBe('ok');

    const blockedAfterGrace = recomputeAccessStatus([obligation], [exception], new Date('2026-11-16T00:00:00-03:00'));
    expect(blockedAfterGrace.status).toBe('blocked');

    // A dívida financeira exibida continua sendo a original — a função não reescreve `dueDate`.
    expect(obligation.dueDate.toISOString()).toBe('2026-11-10T03:00:00.000Z');
  });

  it('reprocessar não renova a janela — a mesma exceção já existente não desloca mais o corte', () => {
    const obligation = buildObligation({ id: 'ob-1', dueDate: localMidnight(new Date('2026-11-10T12:00:00Z')), status: 'awaiting_issue' });
    const exception = buildException({ obligationId: 'ob-1', graceDeadline: localMidnight(new Date('2026-11-15T12:00:00Z')) });

    const result = recomputeAccessStatus([obligation], [exception], new Date('2026-11-20T00:00:00-03:00'));
    expect(result.status).toBe('blocked');
  });

  it('AC-9: cycle é annual quando há obligation anual paga cobrindo "now"', () => {
    const annual = buildObligation({
      kind: 'annual-initial',
      status: 'paid',
      coveragePeriod: { start: localMidnight(new Date('2026-10-24T00:00:00Z')), end: localMidnight(new Date('2027-10-24T00:00:00Z')) },
    });
    const result = recomputeAccessStatus([annual], [], new Date('2027-01-01T00:00:00-03:00'));
    expect(result.cycle).toBe('annual');
    expect(result.status).toBe('ok');
  });

  it('cycle volta a monthly fora da cobertura anual (período expirado, sem renovação paga)', () => {
    const annualExpired = buildObligation({
      kind: 'annual-initial',
      status: 'paid',
      coveragePeriod: { start: localMidnight(new Date('2025-10-24T00:00:00Z')), end: localMidnight(new Date('2026-10-24T00:00:00Z')) },
    });
    const result = recomputeAccessStatus([annualExpired], [], new Date('2026-11-01T00:00:00-03:00'));
    expect(result.cycle).toBe('monthly');
  });

  it('anual estornado não conta como cobertura ativa (cycle volta a monthly)', () => {
    const annualRefunded = buildObligation({
      kind: 'annual-initial',
      status: 'refunded',
      coveragePeriod: { start: localMidnight(new Date('2026-10-24T00:00:00Z')), end: localMidnight(new Date('2027-10-24T00:00:00Z')) },
    });
    const result = recomputeAccessStatus([annualRefunded], [], new Date('2027-01-01T00:00:00-03:00'));
    expect(result.cycle).toBe('monthly');
  });
});
