import { ICashRegisterRepository } from '../../domain/repositories/cash-register.repository.interface';
import { IOrderRepository } from '../../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../../restaurants/domain/repositories/restaurant.repository.interface';
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

function buildRestaurant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r-1',
    cashRegisterMode: 'automatic' as const,
    businessHours: [{ dayOfWeek: 'monday', isClosed: false, openTime: '08:00', closeTime: '22:00' }],
    ...overrides,
  };
}

function buildDeliveredOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o-1',
    orderNumber: 1,
    restaurantId: 'r-1',
    status: 'entregue',
    paymentMethod: 'pix',
    total: 50,
    ...overrides,
  };
}

describe('CashRegisterService (specs/0014-financeiro REQ-5, specs/0118-controle-caixa-automatico-redes-sociais)', () => {
  function setup(overrides: {
    cashRegisterRepository?: Partial<ICashRegisterRepository>;
    restaurantRepository?: Partial<IRestaurantRepository>;
    orderRepository?: Partial<IOrderRepository>;
  } = {}) {
    const cashRegisterRepository: Partial<ICashRegisterRepository> = {
      findOpenSessionByRestaurant: jest.fn().mockResolvedValue(buildSession()),
      findById: jest.fn().mockResolvedValue(buildSession()),
      open: jest.fn().mockResolvedValue(buildSession()),
      close: jest.fn().mockResolvedValue({ session: buildSession({ status: 'fechado' }), calculatedBalance: 0, difference: 0 }),
      addMovement: jest.fn().mockResolvedValue({
        id: 'mv-1',
        cashRegisterSessionId: 'cr-1',
        type: 'entrada',
        amount: 30,
        description: 'Venda #1 (Pix)',
        createdAt: '2026-09-09T09:00:00.000Z',
      }),
      listMovements: jest.fn().mockResolvedValue([]),
      getCalculatedBalance: jest.fn().mockResolvedValue(100),
      ...overrides.cashRegisterRepository,
    };
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue(buildRestaurant()),
      ...overrides.restaurantRepository,
    };
    const orderRepository: Partial<IOrderRepository> = {
      findByRestaurantBetween: jest.fn().mockResolvedValue([]),
      ...overrides.orderRepository,
    };
    const service = new CashRegisterService(
      cashRegisterRepository as ICashRegisterRepository,
      restaurantRepository as IRestaurantRepository,
      orderRepository as IOrderRepository,
    );
    return { cashRegisterRepository, restaurantRepository, orderRepository, service };
  }

  describe('addAutomaticEntry', () => {
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
      const { cashRegisterRepository, service } = setup({ cashRegisterRepository: { findOpenSessionByRestaurant: jest.fn().mockResolvedValue(null) } });

      await service.addAutomaticEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 1, amount: 10, paymentMethod: 'pix' });

      expect(cashRegisterRepository.addMovement).not.toHaveBeenCalled();
    });
  });

  describe('ensureAutomaticSchedule (specs/0118 REQ-3/REQ-4/REQ-6)', () => {
    const MONDAY_9AM_BRT = new Date('2026-10-12T12:00:00.000Z'); // segunda, 09:00 em Brasília (UTC-3)
    const MONDAY_11PM_BRT = new Date('2026-10-13T02:00:00.000Z'); // segunda, 23:00 em Brasília

    it('AC-1: modo automático não cria nenhum campo de horário novo — usa o businessHours já cadastrado (não chama open/close fora da janela)', async () => {
      const { cashRegisterRepository, service } = setup({
        cashRegisterRepository: { findOpenSessionByRestaurant: jest.fn().mockResolvedValue(null) },
      });
      const beforeOpening = new Date('2026-10-12T09:00:00.000Z'); // 06:00 BRT, antes da abertura

      await service.ensureAutomaticSchedule('r-1', beforeOpening);

      expect(cashRegisterRepository.open).not.toHaveBeenCalled();
    });

    it('AC-2: sem sessão aberta e já passou do horário de abertura (08:00 BRT, segunda) -> abre sozinho com openingBalance 0', async () => {
      const { cashRegisterRepository, service } = setup({
        cashRegisterRepository: { findOpenSessionByRestaurant: jest.fn().mockResolvedValue(null) },
      });

      await service.ensureAutomaticSchedule('r-1', MONDAY_9AM_BRT);

      expect(cashRegisterRepository.open).toHaveBeenCalledWith('r-1', 0, 'automatico', true);
    });

    it('AC-3: sessão aberta e já passou do horário de fechamento (22:00 BRT) -> fecha sozinho com o saldo calculado', async () => {
      const { cashRegisterRepository, service } = setup({
        cashRegisterRepository: {
          findOpenSessionByRestaurant: jest.fn().mockResolvedValue(buildSession()),
          getCalculatedBalance: jest.fn().mockResolvedValue(180),
        },
      });

      await service.ensureAutomaticSchedule('r-1', MONDAY_11PM_BRT);

      expect(cashRegisterRepository.close).toHaveBeenCalledWith('cr-1', 180, 'automatico', true);
    });

    it('AC-4/REQ-6: modo manual nunca abre nem fecha sozinho, mesmo dentro da janela de horário', async () => {
      const { cashRegisterRepository, service } = setup({
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({ cashRegisterMode: 'manual' })) },
        cashRegisterRepository: { findOpenSessionByRestaurant: jest.fn().mockResolvedValue(null) },
      });

      await service.ensureAutomaticSchedule('r-1', MONDAY_9AM_BRT);

      expect(cashRegisterRepository.open).not.toHaveBeenCalled();
      expect(cashRegisterRepository.close).not.toHaveBeenCalled();
    });

    it('dia marcado isClosed:true não abre nem fecha nada automaticamente', async () => {
      const { cashRegisterRepository, service } = setup({
        restaurantRepository: {
          findById: jest.fn().mockResolvedValue(
            buildRestaurant({ businessHours: [{ dayOfWeek: 'monday', isClosed: true }] }),
          ),
        },
        cashRegisterRepository: { findOpenSessionByRestaurant: jest.fn().mockResolvedValue(null) },
      });

      await service.ensureAutomaticSchedule('r-1', MONDAY_9AM_BRT);

      expect(cashRegisterRepository.open).not.toHaveBeenCalled();
    });

    it('sessão duplicada (já aberta, dentro da janela de abertura) é no-op silencioso, não lança erro', async () => {
      const { cashRegisterRepository, service } = setup({
        cashRegisterRepository: { findOpenSessionByRestaurant: jest.fn().mockResolvedValue(buildSession()) },
      });

      await expect(service.ensureAutomaticSchedule('r-1', MONDAY_9AM_BRT)).resolves.toBeUndefined();

      expect(cashRegisterRepository.open).not.toHaveBeenCalled();
      expect(cashRegisterRepository.close).not.toHaveBeenCalled();
    });

    it('sem sessão aberta e horário de fechamento já passou é no-op silencioso (não abre fora da janela)', async () => {
      const { cashRegisterRepository, service } = setup({
        cashRegisterRepository: { findOpenSessionByRestaurant: jest.fn().mockResolvedValue(null) },
      });

      await expect(service.ensureAutomaticSchedule('r-1', MONDAY_11PM_BRT)).resolves.toBeUndefined();

      expect(cashRegisterRepository.open).not.toHaveBeenCalled();
    });

    it('restaurante inexistente é no-op silencioso', async () => {
      const { cashRegisterRepository, service } = setup({ restaurantRepository: { findById: jest.fn().mockResolvedValue(null) } });

      await expect(service.ensureAutomaticSchedule('r-1', MONDAY_9AM_BRT)).resolves.toBeUndefined();

      expect(cashRegisterRepository.open).not.toHaveBeenCalled();
    });
  });

  describe('getBalanceByPaymentMethod (AC-6)', () => {
    it('AC-6: 2 vendas Pix (R$ 50 cada) e 1 venda dinheiro (R$ 30) aparecem separadas por forma de pagamento', async () => {
      const { service } = setup({
        orderRepository: {
          findByRestaurantBetween: jest.fn().mockResolvedValue([
            buildDeliveredOrder({ id: 'o-1', paymentMethod: 'pix', total: 50 }),
            buildDeliveredOrder({ id: 'o-2', paymentMethod: 'pix', total: 50 }),
            buildDeliveredOrder({ id: 'o-3', paymentMethod: 'cash', total: 30 }),
          ]),
        },
      });

      const balance = await service.getBalanceByPaymentMethod('cr-1');

      expect(balance).toMatchObject({ pix: 100, cash: 30, creditCard: 0, debitCard: 0, bankTransfer: 0 });
    });

    it('pedidos não entregues não entram na soma', async () => {
      const { service } = setup({
        orderRepository: {
          findByRestaurantBetween: jest.fn().mockResolvedValue([
            buildDeliveredOrder({ id: 'o-1', status: 'aguardandoConfirmacao', paymentMethod: 'pix', total: 50 }),
          ]),
        },
      });

      const balance = await service.getBalanceByPaymentMethod('cr-1');

      expect(balance.pix).toBe(0);
    });

    it('movimento manual (sangria) sem orderId reduz a forma "dinheiro", sem duplicar venda automática de Pix', async () => {
      const { service } = setup({
        orderRepository: {
          findByRestaurantBetween: jest.fn().mockResolvedValue([buildDeliveredOrder({ id: 'o-1', paymentMethod: 'pix', total: 50 })]),
        },
        cashRegisterRepository: {
          listMovements: jest.fn().mockResolvedValue([
            { id: 'mv-automatica', cashRegisterSessionId: 'cr-1', type: 'entrada', amount: 50, description: 'Venda #1 (Pix)', orderId: 'o-1', createdAt: '2026-09-09T09:00:00.000Z' },
            { id: 'mv-manual', cashRegisterSessionId: 'cr-1', type: 'saida', amount: 20, description: 'Sangria', createdAt: '2026-09-09T10:00:00.000Z' },
          ]),
        },
      });

      const balance = await service.getBalanceByPaymentMethod('cr-1');

      expect(balance).toMatchObject({ pix: 50, cash: -20 });
    });
  });
});
