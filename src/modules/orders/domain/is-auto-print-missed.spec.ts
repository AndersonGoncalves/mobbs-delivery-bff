import { isAutoPrintMissed } from './is-auto-print-missed';
import { IOrder } from './entities/order.entity';

type OrderFixture = Pick<IOrder, 'orderType' | 'status' | 'autoPrintStatus' | 'statusHistory' | 'tableClosedAt'>;

function buildOrder(overrides: Partial<OrderFixture> = {}): OrderFixture {
  return {
    orderType: 'delivery',
    status: 'confirmado',
    statusHistory: [],
    ...overrides,
  };
}

describe('isAutoPrintMissed (pedido explícito do usuário, 17/11/2026)', () => {
  describe('delivery/pickup — contado desde a confirmação (mesmo comportamento de antes)', () => {
    it('true quando confirmado há mais tempo que maxAgeMinutes e ainda não impresso', () => {
      const tooOld = new Date(Date.now() - 10 * 60_000).toISOString();
      const order = buildOrder({ statusHistory: [{ status: 'confirmado', changedAt: tooOld }] });

      expect(isAutoPrintMissed(order, 5)).toBe(true);
    });

    it('false quando confirmado dentro da janela', () => {
      const recent = new Date(Date.now() - 1 * 60_000).toISOString();
      const order = buildOrder({ statusHistory: [{ status: 'confirmado', changedAt: recent }] });

      expect(isAutoPrintMissed(order, 5)).toBe(false);
    });

    it('false quando ainda não confirmado (sem entrada "confirmado" no histórico)', () => {
      const order = buildOrder({ statusHistory: [] });

      expect(isAutoPrintMissed(order, 5)).toBe(false);
    });

    it('false quando já impresso (autoPrintStatus "printed")', () => {
      const tooOld = new Date(Date.now() - 10 * 60_000).toISOString();
      const order = buildOrder({ statusHistory: [{ status: 'confirmado', changedAt: tooOld }], autoPrintStatus: 'printed' });

      expect(isAutoPrintMissed(order, 5)).toBe(false);
    });

    it('false quando cancelado', () => {
      const tooOld = new Date(Date.now() - 10 * 60_000).toISOString();
      const order = buildOrder({ status: 'cancelado', statusHistory: [{ status: 'confirmado', changedAt: tooOld }] });

      expect(isAutoPrintMissed(order, 5)).toBe(false);
    });

    it('false pra pedido entregue sem entrada "confirmado" no histórico (fixture mínima)', () => {
      const order = buildOrder({ status: 'entregue', statusHistory: [] });

      expect(isAutoPrintMissed(order, 5)).toBe(false);
    });
  });

  // Pedido explícito do usuário (17/11/2026) — mesa/balcão: contado desde `tableClosedAt`
  // (fechamento), nunca desde `confirmado` (mesa não passa por esse status e fica aberta por
  // horas — contar da confirmação faria todo ticket de mesa aparecer "perdido" sempre).
  describe('mesa/balcão — contado desde tableClosedAt', () => {
    it('true quando fechada há mais tempo que maxAgeMinutes, status entregue, ainda não impressa', () => {
      const tooOld = new Date(Date.now() - 10 * 60_000).toISOString();
      const order = buildOrder({ orderType: 'table', status: 'entregue', tableClosedAt: tooOld });

      expect(isAutoPrintMissed(order, 5)).toBe(true);
    });

    it('false quando fechada dentro da janela', () => {
      const recent = new Date(Date.now() - 1 * 60_000).toISOString();
      const order = buildOrder({ orderType: 'table', status: 'entregue', tableClosedAt: recent });

      expect(isAutoPrintMissed(order, 5)).toBe(false);
    });

    it('false quando ainda não fechada (sem tableClosedAt)', () => {
      const order = buildOrder({ orderType: 'table', status: 'aguardandoConfirmacao' });

      expect(isAutoPrintMissed(order, 5)).toBe(false);
    });

    it('false quando status não é "entregue" (mesa ainda aberta, mesmo com tableClosedAt antigo por algum motivo)', () => {
      const tooOld = new Date(Date.now() - 10 * 60_000).toISOString();
      const order = buildOrder({ orderType: 'table', status: 'confirmado', tableClosedAt: tooOld });

      expect(isAutoPrintMissed(order, 5)).toBe(false);
    });

    it('false quando já impressa (autoPrintStatus "printed")', () => {
      const tooOld = new Date(Date.now() - 10 * 60_000).toISOString();
      const order = buildOrder({ orderType: 'table', status: 'entregue', tableClosedAt: tooOld, autoPrintStatus: 'printed' });

      expect(isAutoPrintMissed(order, 5)).toBe(false);
    });

    it('respeita o maxAgeMinutes configurado (60 em vez do default)', () => {
      const closedAt = new Date(Date.now() - 10 * 60_000).toISOString();
      const order = buildOrder({ orderType: 'table', status: 'entregue', tableClosedAt: closedAt });

      expect(isAutoPrintMissed(order, 60)).toBe(false);
    });
  });
});
