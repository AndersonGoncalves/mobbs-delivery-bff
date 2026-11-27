import { buildAccountListQuery } from './build-account-list-query';

// Achado de performance da auditoria pré-produção (31/10/2026) — "listas de contas a pagar/
// receber sem paginação nem filtro de período obrigatório".
describe('buildAccountListQuery', () => {
  it('sem from/to, filtra por restaurantId + (aberto OU dueDate dos últimos 12 meses)', () => {
    const now = new Date('2026-10-31T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const query = buildAccountListQuery('r-1');

    expect(query).toEqual({
      restaurantId: 'r-1',
      $or: [{ status: 'aberto' }, { dueDate: { $gte: new Date('2025-10-31T12:00:00.000Z') } }],
    });
    jest.useRealTimers();
  });

  it('com from/to explícito, filtra só por dueDate no período — sem o $or de "aberto sempre aparece"', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-01-31T23:59:59.000Z');

    const query = buildAccountListQuery('r-1', { from, to });

    expect(query).toEqual({ restaurantId: 'r-1', dueDate: { $gte: from, $lte: to } });
  });

  it('só from (sem to) filtra em aberto, sem limite superior', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');

    const query = buildAccountListQuery('r-1', { from });

    expect(query).toEqual({ restaurantId: 'r-1', dueDate: { $gte: from } });
  });

  it('só to (sem from) filtra até a data, sem limite inferior', () => {
    const to = new Date('2026-01-31T23:59:59.000Z');

    const query = buildAccountListQuery('r-1', { to });

    expect(query).toEqual({ restaurantId: 'r-1', dueDate: { $lte: to } });
  });

  // Achado de auditoria pré-produção (31/10/2026) — "listas sem paginação em financeiro,
  // clientes e estoque": `search` precisa continuar funcionando (filtro por descrição) ao migrar
  // a busca de client-side pra server-side.
  it('search filtra por descrição, parcial e case-insensitive, combinado com o filtro de período padrão', () => {
    const now = new Date('2026-10-31T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const query = buildAccountListQuery('r-1', { search: 'alu.guel' });

    expect(query).toEqual({
      restaurantId: 'r-1',
      $or: [{ status: 'aberto' }, { dueDate: { $gte: new Date('2025-10-31T12:00:00.000Z') } }],
      description: { $regex: 'alu\\.guel', $options: 'i' },
    });
    jest.useRealTimers();
  });

  it('search combinado com from/to explícito', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-01-31T23:59:59.000Z');

    const query = buildAccountListQuery('r-1', { from, to, search: 'aluguel' });

    expect(query).toEqual({
      restaurantId: 'r-1',
      dueDate: { $gte: from, $lte: to },
      description: { $regex: 'aluguel', $options: 'i' },
    });
  });

  // specs/0231-filtro-datas-contas-pedidos-compra REQ-1/REQ-4 (AC-1).
  describe('status (specs/0231)', () => {
    const now = new Date('2026-11-27T12:00:00.000Z');
    const twelveMonthsAgo = new Date('2025-11-27T12:00:00.000Z');

    beforeEach(() => jest.useFakeTimers().setSystemTime(now));
    afterEach(() => jest.useRealTimers());

    it('AC-1: período + "aberto" → só os em aberto do período', () => {
      const from = new Date('2026-11-01T00:00:00.000Z');
      const to = new Date('2026-11-30T23:59:59.999Z');

      expect(buildAccountListQuery('r-1', { from, to, status: 'aberto' })).toEqual({
        restaurantId: 'r-1',
        dueDate: { $gte: from, $lte: to },
        status: 'aberto',
      });
    });

    it('"aberto" sem período → todos os abertos, de qualquer idade', () => {
      expect(buildAccountListQuery('r-1', { status: 'aberto' })).toEqual({ restaurantId: 'r-1', status: 'aberto' });
    });

    it('"pago" sem período → mantém a janela de 12 meses do default', () => {
      expect(buildAccountListQuery('r-1', { status: 'pago' })).toEqual({
        restaurantId: 'r-1',
        status: 'pago',
        dueDate: { $gte: twelveMonthsAgo },
      });
    });

    it('AC-1: sem período e sem status → exatamente o default de antes', () => {
      expect(buildAccountListQuery('r-1', { status: undefined })).toEqual({
        restaurantId: 'r-1',
        $or: [{ status: 'aberto' }, { dueDate: { $gte: twelveMonthsAgo } }],
      });
    });
  });
});
