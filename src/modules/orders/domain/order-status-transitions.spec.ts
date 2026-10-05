import { isValidOrderStatusTransition } from './order-status-transitions';

describe('isValidOrderStatusTransition (specs/0096-status-pedido-retirada-sem-saiu-entrega)', () => {
  it('AC-1: retirada vai de emPreparo direto pra entregue, sem passar por saiuParaEntrega', () => {
    expect(isValidOrderStatusTransition('emPreparo', 'entregue', 'pickup')).toBe(true);
    expect(isValidOrderStatusTransition('emPreparo', 'saiuParaEntrega', 'pickup')).toBe(false);
  });

  it('AC-4: entrega mantém a sequência com saiuParaEntrega', () => {
    expect(isValidOrderStatusTransition('emPreparo', 'saiuParaEntrega', 'delivery')).toBe(true);
    expect(isValidOrderStatusTransition('emPreparo', 'entregue', 'delivery')).toBe(false);
    expect(isValidOrderStatusTransition('saiuParaEntrega', 'entregue', 'delivery')).toBe(true);
  });
});
