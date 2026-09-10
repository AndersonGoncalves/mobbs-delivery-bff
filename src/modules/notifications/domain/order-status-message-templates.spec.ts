import { buildOrderStatusMessage } from './order-status-message-templates';

describe('buildOrderStatusMessage', () => {
  it('AC-2: texto de confirmação menciona o orderNumber', () => {
    expect(buildOrderStatusMessage('confirmado', 123)).toBe('Seu pedido #123 foi confirmado pelo restaurante!');
  });

  it('texto de "saiu para entrega"', () => {
    expect(buildOrderStatusMessage('saiuParaEntrega', 123)).toBe('Seu pedido #123 saiu para entrega!');
  });

  it('texto de "em preparo"', () => {
    expect(buildOrderStatusMessage('emPreparo', 123)).toBe('Seu pedido #123 está sendo preparado.');
  });

  it('texto de "entregue"', () => {
    expect(buildOrderStatusMessage('entregue', 123)).toBe('Seu pedido #123 foi entregue. Bom apetite!');
  });

  it('cancelamento com motivo inclui o motivo', () => {
    expect(buildOrderStatusMessage('cancelado', 123, 'sem estoque')).toBe('Pedido #123 cancelado: sem estoque');
  });

  it('cancelamento sem motivo usa texto genérico', () => {
    expect(buildOrderStatusMessage('cancelado', 123)).toBe('Pedido #123 foi cancelado.');
  });

  it('status inicial (aguardandoConfirmacao) não gera mensagem de mudança de status', () => {
    expect(buildOrderStatusMessage('aguardandoConfirmacao', 123)).toBeNull();
  });
});
