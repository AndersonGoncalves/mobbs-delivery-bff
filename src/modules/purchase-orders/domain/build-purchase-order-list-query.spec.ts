import { buildPurchaseOrderListQuery } from './build-purchase-order-list-query';

// specs/0231-filtro-datas-contas-pedidos-compra REQ-2/REQ-4 (AC-2).
describe('buildPurchaseOrderListQuery', () => {
  const now = new Date('2026-11-27T12:00:00.000Z');
  const twelveMonthsAgo = new Date('2025-11-27T12:00:00.000Z');

  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());

  it('AC-2: sem filtros → em aberto de qualquer data + o resto dos últimos 12 meses', () => {
    expect(buildPurchaseOrderListQuery('r-1')).toEqual({
      restaurantId: 'r-1',
      $or: [{ status: 'aberto' }, { createdAt: { $gte: twelveMonthsAgo } }],
    });
  });

  it('AC-2: período + situação filtram createdAt e status, sem o $or', () => {
    const from = new Date('2026-11-01T03:00:00.000Z');
    const to = new Date('2026-12-01T02:59:59.999Z');

    expect(buildPurchaseOrderListQuery('r-1', { from, to, status: 'recebido' })).toEqual({
      restaurantId: 'r-1',
      createdAt: { $gte: from, $lte: to },
      status: 'recebido',
    });
  });

  it('situação "aberto" sem período traz todos os abertos, sem janela de 12 meses', () => {
    expect(buildPurchaseOrderListQuery('r-1', { status: 'aberto' })).toEqual({ restaurantId: 'r-1', status: 'aberto' });
  });

  it('situação "recebido" sem período mantém a janela de 12 meses', () => {
    expect(buildPurchaseOrderListQuery('r-1', { status: 'recebido' })).toEqual({
      restaurantId: 'r-1',
      status: 'recebido',
      createdAt: { $gte: twelveMonthsAgo },
    });
  });

  it('AC-2: busca por fornecedor vira supplierId $in (combinada com o default)', () => {
    expect(buildPurchaseOrderListQuery('r-1', { supplierIds: ['sup-1', 'sup-2'] })).toEqual({
      restaurantId: 'r-1',
      $or: [{ status: 'aberto' }, { createdAt: { $gte: twelveMonthsAgo } }],
      supplierId: { $in: ['sup-1', 'sup-2'] },
    });
  });

  it('busca por fornecedor sem nenhum nome casando → $in vazio (lista vazia, não "todos")', () => {
    expect(buildPurchaseOrderListQuery('r-1', { supplierIds: [] })).toMatchObject({ supplierId: { $in: [] } });
  });
});
