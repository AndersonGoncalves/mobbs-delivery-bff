import { isFiscalPrintMissed } from './is-fiscal-print-missed';

describe('isFiscalPrintMissed (pedido explícito do usuário, 16/11/2026)', () => {
  const fourMinutesAgo = new Date(Date.now() - 4 * 60_000).toISOString();
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();

  it('true quando a nota foi emitida há mais de 3 minutos e ainda não foi impressa', () => {
    expect(isFiscalPrintMissed({ fiscal: { status: 'emitido', emittedAt: fourMinutesAgo } })).toBe(true);
  });

  it('false quando a nota foi emitida há menos de 3 minutos (ainda dentro do prazo normal)', () => {
    expect(isFiscalPrintMissed({ fiscal: { status: 'emitido', emittedAt: oneMinuteAgo } })).toBe(false);
  });

  it('false quando já foi impressa, mesmo há muito tempo', () => {
    expect(isFiscalPrintMissed({ fiscal: { status: 'emitido', emittedAt: fourMinutesAgo }, fiscalPrintStatus: 'printed' })).toBe(false);
  });

  it('false quando não há nota emitida (pendente, rejeitada, cancelada ou sem integração)', () => {
    expect(isFiscalPrintMissed({ fiscal: { status: 'pendente', emittedAt: fourMinutesAgo } })).toBe(false);
    expect(isFiscalPrintMissed({ fiscal: { status: 'rejeitado' } })).toBe(false);
    expect(isFiscalPrintMissed({ fiscal: { status: 'cancelado', emittedAt: fourMinutesAgo } })).toBe(false);
    expect(isFiscalPrintMissed({})).toBe(false);
  });

  it('false quando emitido sem emittedAt (nota de antes desta spec — mais seguro que assumir atraso)', () => {
    expect(isFiscalPrintMissed({ fiscal: { status: 'emitido' } })).toBe(false);
  });
});
