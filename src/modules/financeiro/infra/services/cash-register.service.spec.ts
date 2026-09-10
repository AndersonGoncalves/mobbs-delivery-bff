import { ICashRegisterRepository } from '../../domain/repositories/cash-register.repository.interface';
import { CashRegisterService } from './cash-register.service';

function buildSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cr-1',
    restaurantId: 'r-1',
    openedAt: '2026-09-09T08:00:00.000Z',
    openingBalance: 100,
    status: 'aberto' as const,
    ...overrides,
  };
}

describe('CashRegisterService (specs/0014-financeiro REQ-5)', () => {
  function setup(overrides: Partial<ICashRegisterRepository> = {}) {
    const cashRegisterRepository: Partial<ICashRegisterRepository> = {
      findOpenSessionByRestaurant: jest.fn().mockResolvedValue(buildSession()),
      addMovement: jest.fn().mockResolvedValue({
        id: 'mv-1',
        cashRegisterSessionId: 'cr-1',
        type: 'entrada',
        amount: 30,
        description: 'Venda #1 (Pix)',
        createdAt: '2026-09-09T09:00:00.000Z',
      }),
      ...overrides,
    };
    const service = new CashRegisterService(cashRegisterRepository as ICashRegisterRepository);
    return { cashRegisterRepository, service };
  }

  it('AC-5: pedido pago via Pix com sessão de caixa aberta lança entrada automática vinculada ao pedido', async () => {
    const { cashRegisterRepository, service } = setup();

    await service.addAutomaticEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 42, amount: 55, paymentMethod: 'pix' });

    expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-1', {
      type: 'entrada',
      amount: 55,
      description: 'Venda #42 (Pix)',
      orderId: 'o-1',
    });
  });

  it('AC-5: pedido pago em dinheiro/cartão/transferência nunca lança automaticamente', async () => {
    for (const paymentMethod of ['cash', 'creditCard', 'debitCard', 'bankTransfer']) {
      const { cashRegisterRepository, service } = setup();

      await service.addAutomaticEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 1, amount: 10, paymentMethod });

      expect(cashRegisterRepository.findOpenSessionByRestaurant).not.toHaveBeenCalled();
      expect(cashRegisterRepository.addMovement).not.toHaveBeenCalled();
    }
  });

  it('REQ-5: pedido Pix sem sessão de caixa aberta não lança nada (não força abertura)', async () => {
    const { cashRegisterRepository, service } = setup({ findOpenSessionByRestaurant: jest.fn().mockResolvedValue(null) });

    await service.addAutomaticEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 1, amount: 10, paymentMethod: 'pix' });

    expect(cashRegisterRepository.addMovement).not.toHaveBeenCalled();
  });
});
