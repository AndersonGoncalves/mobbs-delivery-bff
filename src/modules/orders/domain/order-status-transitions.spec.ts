import { isOrderCancellable, isOrderCancellableByOperator, isValidOrderStatusTransition } from './order-status-transitions';

describe('isValidOrderStatusTransition', () => {
  it('0176: saída para entrega é cancelável só pela nova política administrativa', () => {
    expect(isOrderCancellableByOperator('saiuParaEntrega')).toBe(true);
    expect(isOrderCancellable('saiuParaEntrega')).toBe(false);
    expect(isOrderCancellableByOperator('entregue')).toBe(false);
    expect(isOrderCancellableByOperator('cancelado')).toBe(false);
  });
  // Retirada passa pelo passo "saiuParaEntrega" (que, em pedido de retirada, é "pronto para retirar") e depois
  // "entregue". A mensagem e o rótulo mudam; a sequência é a mesma.
  it('retirada: emPreparo -> saiuParaEntrega (pronto pra retirar) -> entregue', () => {
    expect(isValidOrderStatusTransition('emPreparo', 'saiuParaEntrega')).toBe(true);
    expect(isValidOrderStatusTransition('saiuParaEntrega', 'entregue')).toBe(true);
    expect(isValidOrderStatusTransition('emPreparo', 'entregue')).toBe(false);
  });

  it('AC-4: entrega mantém a sequência com saiuParaEntrega', () => {
    expect(isValidOrderStatusTransition('emPreparo', 'saiuParaEntrega')).toBe(true);
    expect(isValidOrderStatusTransition('emPreparo', 'entregue')).toBe(false);
    expect(isValidOrderStatusTransition('saiuParaEntrega', 'entregue')).toBe(true);
  });
});
