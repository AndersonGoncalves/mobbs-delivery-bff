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
  beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-09-09T12:00:00Z')); });
  afterEach(() => jest.useRealTimers());
  function setup(overrides: {
    cashRegisterRepository?: Partial<ICashRegisterRepository>;
    restaurantRepository?: Partial<IRestaurantRepository>;
    orderRepository?: Partial<IOrderRepository>;
  } = {}) {
    const cashRegisterRepository: Partial<ICashRegisterRepository> = {
      findOpenSessionByRestaurant: jest.fn().mockResolvedValue(buildSession()),
      findSessionByDate: overrides.cashRegisterRepository?.findOpenSessionByRestaurant ?? jest.fn().mockResolvedValue(buildSession()),
      // specs/0219-multiplas-sessoes-caixa-por-dia — fallback de lançamento tardio (pode ter mais
      // de uma sessão fechada no mesmo dia; vazio por padrão aqui, já que os testes padrão sempre
      // têm uma sessão ABERTA via `findOpenSessionByRestaurant`).
      findClosedSessionsForDate: jest.fn().mockResolvedValue([]),
      findPendingSessions: jest.fn().mockResolvedValue([]),
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
      listAll: jest.fn().mockResolvedValue([]),
      ...overrides.restaurantRepository,
    };
    const orderRepository: Partial<IOrderRepository> = {
      findReceivedSalesBetween: jest.fn().mockResolvedValue([]),
      findConfirmedPixSalesBetween: jest.fn().mockResolvedValue([]),
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
    // Pedido explícito do usuário (follow-up, achado real 06/11/2026) — inverte o teste "0176"
    // antigo (`nunca lança uma venda de hoje no caixa pendente de ontem`): aquela regra impedia
    // dinheiro de verdade de entrar na conferência quando o operador só fecha o caixa depois da
    // meia-noite (ex. pedido entregue de madrugada, caixa fechado de manhã) — só existe uma sessão
    // aberta por restaurante, então é sempre nela que a venda deve entrar, não importa a data.
    it('sessão aberta de uma data anterior continua lançando vendas normalmente (sem teto de meia-noite)', async () => {
      const { service, cashRegisterRepository } = setup({
        cashRegisterRepository: { findOpenSessionByRestaurant: jest.fn().mockResolvedValue(buildSession({ openedAt: '2026-09-08T12:00:00Z' })) },
      });
      await service.addAutomaticEntry({ restaurantId: 'r-1', orderId: 'today', orderNumber: 1, amount: 10, paymentMethod: 'pix' });
      expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-1', expect.objectContaining({ orderId: 'today', amount: 10 }));
    });
    it('pedido pago em qualquer forma, com sessão aberta, lança entrada automática', async () => {
      for (const paymentMethod of ['pix', 'cash', 'creditCard', 'creditCardOnline', 'debitCard']) {
        const { cashRegisterRepository, service } = setup();

        await service.addAutomaticEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 42, amount: 55, paymentMethod });

        expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-1', expect.objectContaining({
          type: 'entrada',
          amount: 55,
          orderId: 'o-1',
          paymentMethod,
        }));
      }
    });

    it('pagamento de mesa lança uma entrada por pagamento, sem repetir o mesmo paymentId', async () => {
      const { cashRegisterRepository, service } = setup({
        cashRegisterRepository: {
          listMovements: jest.fn().mockResolvedValue([
            { id: 'mv-1', cashRegisterSessionId: 'cr-1', type: 'entrada', amount: 10, description: 'Mesa/balcão #7 (Dinheiro)', orderId: 'o-1', paymentId: 'pay-1', paymentMethod: 'cash', createdAt: '2026-09-09T09:00:00.000Z' },
          ]),
        },
      });

      await service.addAutomaticEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 7, amount: 10, paymentMethod: 'cash', paymentId: 'pay-1' });
      await service.addAutomaticEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 7, amount: 6, paymentMethod: 'pix', paymentId: 'pay-2' });

      expect(cashRegisterRepository.addMovement).toHaveBeenCalledTimes(1);
      expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-1', expect.objectContaining({ paymentId: 'pay-2', paymentMethod: 'pix', amount: 6 }));
    });

    // Pedido explícito do usuário (11/11/2026) — descrição do movimento precisa deixar claro
    // quando o pagamento de mesa/balcão foi um "Registrar parcial" (conta ainda aberta), distinto
    // do(s) pagamento(s) do fechamento normal da conta — mesmo quando o fechamento também é
    // `paymentId`-based (dividido em mais de uma forma de pagamento).
    it('pagamento parcial de mesa/balcão ("Registrar parcial") destaca "pagamento parcial" na descrição', async () => {
      const { cashRegisterRepository, service } = setup();

      await service.addAutomaticEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 115, amount: 2, paymentMethod: 'cash', paymentId: 'pay-1', isPartialPayment: true });

      expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-1', expect.objectContaining({ description: 'Mesa/balcão - pagamento parcial #115 (Dinheiro)' }));
    });

    it('pagamento do fechamento da conta (isPartialPayment ausente) NÃO destaca "pagamento parcial", mesmo sendo paymentId-based', async () => {
      const { cashRegisterRepository, service } = setup();

      await service.addAutomaticEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 72, amount: 10, paymentMethod: 'cash', paymentId: 'pay-1' });

      expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-1', expect.objectContaining({ description: 'Mesa/balcão #72 (Dinheiro)' }));
    });

    it('pagamento de mesa não duplica um lançamento antigo do pedido inteiro', async () => {
      const { cashRegisterRepository, service } = setup({
        cashRegisterRepository: {
          listMovements: jest.fn().mockResolvedValue([
            { id: 'mv-1', cashRegisterSessionId: 'cr-1', type: 'entrada', amount: 16, description: 'Venda #7 (Pix)', orderId: 'o-1', createdAt: '2026-09-09T09:00:00.000Z' },
          ]),
        },
      });

      await service.addAutomaticEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 7, amount: 16, paymentMethod: 'pix', paymentId: 'pay-1' });

      expect(cashRegisterRepository.addMovement).not.toHaveBeenCalled();
    });

    // Pedido explícito do usuário (follow-up, achado real 06/11/2026) — substitui o teste antigo
    // "não força abertura": sem NENHUM caixa aberto (ex. modo manual, operador esqueceu de abrir),
    // a venda em mesa/balcão/PDV/delivery acontecia normal mas o lançamento sumia pra sempre, sem
    // aviso — nem reabrir resgatava, porque nunca existiu sessão nenhuma. Agora abre uma sessão
    // nova (primeira venda do dia), saldo inicial R$0, marcada "aberta automaticamente".
    it('sem nenhuma sessão aberta e sem sessão de hoje, abre uma nova automaticamente (primeira venda do dia)', async () => {
      const { cashRegisterRepository, service } = setup({
        cashRegisterRepository: {
          findOpenSessionByRestaurant: jest.fn().mockResolvedValue(null),
          findClosedSessionsForDate: jest.fn().mockResolvedValue([]),
          open: jest.fn().mockResolvedValue(buildSession({ id: 'cr-nova' })),
        },
      });

      await service.addAutomaticEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 1, amount: 10, paymentMethod: 'pix' });

      expect(cashRegisterRepository.open).toHaveBeenCalledWith('r-1', 0, 'automatico', true);
      expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-nova', expect.objectContaining({ orderId: 'o-1', amount: 10 }));
    });

    // Caso 2 do cabeçalho de `addAutomaticEntry` — caixa de hoje já existe, mas só pode estar
    // fechado (senão `findOpenSessionByRestaurant` já teria achado ele acima); lança mesmo assim,
    // sem abrir uma sessão nova. `getClosingSummary` é quem separa esse lançamento da conferência
    // já feita (`lateMovements`).
    it('sem nenhuma sessão aberta mas a de hoje já existe (fechada), lança nela sem abrir uma segunda', async () => {
      const { cashRegisterRepository, service } = setup({
        cashRegisterRepository: {
          findOpenSessionByRestaurant: jest.fn().mockResolvedValue(null),
          findClosedSessionsForDate: jest.fn().mockResolvedValue([buildSession({ id: 'cr-hoje', status: 'fechado' })]),
        },
      });

      await service.addAutomaticEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 1, amount: 10, paymentMethod: 'pix' });

      expect(cashRegisterRepository.open).not.toHaveBeenCalled();
      expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-hoje', expect.objectContaining({ orderId: 'o-1', amount: 10 }));
    });

    // specs/0219-multiplas-sessoes-caixa-por-dia REQ-5 — decisão explícita do usuário
    // (21/11/2026): com mais de uma sessão fechada no mesmo dia (turnos), o lançamento tardio cai
    // na ÚLTIMA (mais recente), nunca numa sessão anterior do mesmo dia.
    it('com mais de uma sessão fechada hoje (turnos), lançamento tardio cai na mais recente', async () => {
      const { cashRegisterRepository, service } = setup({
        cashRegisterRepository: {
          findOpenSessionByRestaurant: jest.fn().mockResolvedValue(null),
          findClosedSessionsForDate: jest.fn().mockResolvedValue([
            buildSession({ id: 'cr-manha', status: 'fechado' }),
            buildSession({ id: 'cr-tarde', status: 'fechado' }),
          ]),
        },
      });

      await service.addAutomaticEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 1, amount: 10, paymentMethod: 'pix' });

      expect(cashRegisterRepository.open).not.toHaveBeenCalled();
      expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-tarde', expect.objectContaining({ orderId: 'o-1', amount: 10 }));
    });
  });

  describe('addAutomaticReversalEntry (specs/0213-caixa-pix-na-confirmacao REQ-3/REQ-4)', () => {
    it('lança um movimento de saída (estorno) vinculado ao pedido', async () => {
      const { cashRegisterRepository, service } = setup();

      await service.addAutomaticReversalEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 42, amount: 50, paymentMethod: 'pix' });

      expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-1', expect.objectContaining({
        type: 'saida',
        amount: 50,
        orderId: 'o-1',
        paymentMethod: 'pix',
        description: 'Estorno - Venda #42 (Pix)',
      }));
    });

    it('nunca estorna duas vezes o mesmo pedido', async () => {
      const { cashRegisterRepository, service } = setup({
        cashRegisterRepository: {
          listMovements: jest.fn().mockResolvedValue([
            { id: 'mv-entrada', cashRegisterSessionId: 'cr-1', type: 'entrada', amount: 50, description: 'Venda #1 (Pix)', orderId: 'o-1', createdAt: '2026-09-09T09:00:00.000Z' },
            { id: 'mv-estorno', cashRegisterSessionId: 'cr-1', type: 'saida', amount: 50, description: 'Estorno - Venda #1 (Pix)', orderId: 'o-1', createdAt: '2026-09-09T10:00:00.000Z' },
          ]),
        },
      });

      await service.addAutomaticReversalEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 1, amount: 50, paymentMethod: 'pix' });

      expect(cashRegisterRepository.addMovement).not.toHaveBeenCalled();
    });

    it('abre uma sessão nova (primeira venda do dia) se precisar, mesmo pra estornar', async () => {
      const { cashRegisterRepository, service } = setup({
        cashRegisterRepository: {
          findOpenSessionByRestaurant: jest.fn().mockResolvedValue(null),
          findClosedSessionsForDate: jest.fn().mockResolvedValue([]),
          open: jest.fn().mockResolvedValue(buildSession({ id: 'cr-nova' })),
        },
      });

      await service.addAutomaticReversalEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 1, amount: 10, paymentMethod: 'pix' });

      expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-nova', expect.objectContaining({ type: 'saida', orderId: 'o-1' }));
    });
  });

  describe('addPartialRefundEntry (specs/0214-estorno-sobrepagamento-mesa REQ-2/REQ-8)', () => {
    it('lança um movimento de saída (troco a devolver) vinculado ao pedido', async () => {
      const { cashRegisterRepository, service } = setup();

      await service.addPartialRefundEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 72, amount: 9, paymentMethod: 'cash' });

      expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-1', expect.objectContaining({
        type: 'saida',
        amount: 9,
        orderId: 'o-1',
        paymentMethod: 'cash',
        description: 'Troco a devolver - Mesa/balcão #72 (Dinheiro)',
      }));
    });

    it('DIFERENTE de addAutomaticReversalEntry — não tem dedup própria, pode estornar o mesmo pedido mais de uma vez', async () => {
      const { cashRegisterRepository, service } = setup({
        cashRegisterRepository: {
          listMovements: jest.fn().mockResolvedValue([
            { id: 'mv-1', cashRegisterSessionId: 'cr-1', type: 'saida', amount: 5, description: 'Troco a devolver - Mesa/balcão #1 (Dinheiro)', orderId: 'o-1', createdAt: '2026-09-09T09:00:00.000Z' },
          ]),
        },
      });

      await service.addPartialRefundEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 1, amount: 3, paymentMethod: 'cash' });

      expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-1', expect.objectContaining({ type: 'saida', amount: 3, orderId: 'o-1' }));
    });

    it('abre uma sessão nova (primeira venda do dia) se precisar', async () => {
      const { cashRegisterRepository, service } = setup({
        cashRegisterRepository: {
          findOpenSessionByRestaurant: jest.fn().mockResolvedValue(null),
          findClosedSessionsForDate: jest.fn().mockResolvedValue([]),
          open: jest.fn().mockResolvedValue(buildSession({ id: 'cr-nova' })),
        },
      });

      await service.addPartialRefundEntry({ restaurantId: 'r-1', orderId: 'o-1', orderNumber: 1, amount: 9, paymentMethod: 'cash' });

      expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-nova', expect.objectContaining({ type: 'saida', orderId: 'o-1' }));
    });
  });

  describe('ensureAutomaticSchedule (specs/0118 REQ-3/REQ-4/REQ-6)', () => {
    const MONDAY_9AM_BRT = new Date('2026-10-12T12:00:00.000Z'); // segunda, 09:00 em Brasília (UTC-3)
    const MONDAY_11PM_BRT = new Date('2026-10-13T02:00:00.000Z'); // segunda, 23:00 em Brasília

    it('0176: abre o caixa da data de hoje quando não há nenhum caixa pendente de outra data', async () => {
      const { service, cashRegisterRepository } = setup({
        cashRegisterRepository: { findSessionByDate: jest.fn().mockResolvedValue(null) },
      });
      await service.ensureAutomaticSchedule('r-1', MONDAY_9AM_BRT);
      expect(cashRegisterRepository.open).toHaveBeenCalledWith('r-1', 0, 'automatico', true, MONDAY_9AM_BRT);
      expect(cashRegisterRepository.close).not.toHaveBeenCalled();
    });

    // Ajuste explícito do usuário (02/11/2026) — revogou o comportamento antigo (specs/0176):
    // agora NUNCA abre a data de hoje, nem automaticamente, enquanto um caixa de uma data
    // anterior segue aberto sem fechamento. `pendingSessions` (já devolvido por
    // `GET .../cash-register/open`) é quem avisa o operador a fechar o caixa antigo primeiro.
    it('ajuste 02/11/2026: NÃO abre o caixa de hoje automaticamente enquanto houver um caixa de outra data ainda aberto', async () => {
      const { service, cashRegisterRepository } = setup({
        cashRegisterRepository: {
          findSessionByDate: jest.fn().mockResolvedValue(null),
          findPendingSessions: jest.fn().mockResolvedValue([buildSession({ id: 'old', businessDate: '2026-10-11', status: 'aberto' })]),
        },
      });

      await expect(service.ensureAutomaticSchedule('r-1', MONDAY_9AM_BRT)).resolves.toBeUndefined();

      expect(cashRegisterRepository.open).not.toHaveBeenCalled();
    });

    it('0176: data já fechada não é reaberta automaticamente', async () => {
      const { service, cashRegisterRepository } = setup({
        cashRegisterRepository: { findSessionByDate: jest.fn().mockResolvedValue(buildSession({ status: 'fechado' })) },
      });
      await service.ensureAutomaticSchedule('r-1', MONDAY_9AM_BRT);
      expect(cashRegisterRepository.open).not.toHaveBeenCalled();
    });

    it('0176: horário que cruza meia-noite abre outro caixa na nova data', async () => {
      const { service, cashRegisterRepository } = setup({
        restaurantRepository: { findById: jest.fn().mockResolvedValue(buildRestaurant({
          businessHours: [{ dayOfWeek: 'monday', isClosed: false, openTime: '18:00', closeTime: '02:00' }],
        })) },
        cashRegisterRepository: { findSessionByDate: jest.fn().mockResolvedValue(null) },
      });
      const afterMidnight = new Date('2026-10-13T04:00:00Z');
      await service.ensureAutomaticSchedule('r-1', afterMidnight);
      expect(cashRegisterRepository.findSessionByDate).toHaveBeenCalledWith('r-1', '2026-10-13');
      expect(cashRegisterRepository.open).toHaveBeenCalledWith('r-1', 0, 'automatico', true, afterMidnight);
    });

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

      expect(cashRegisterRepository.open).toHaveBeenCalledWith('r-1', 0, 'automatico', true, MONDAY_9AM_BRT);
    });

    it('0176: horário de fechamento não fecha o caixa automaticamente', async () => {
      const { cashRegisterRepository, service } = setup({
        cashRegisterRepository: {
          findOpenSessionByRestaurant: jest.fn().mockResolvedValue(buildSession()),
          getCalculatedBalance: jest.fn().mockResolvedValue(180),
        },
      });

      await service.ensureAutomaticSchedule('r-1', MONDAY_11PM_BRT);

      expect(cashRegisterRepository.close).not.toHaveBeenCalled();
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

  describe('closeDueAutomaticSessions (specs/0216-fechamento-automatico-caixa AC-2/AC-3/AC-4/AC-5)', () => {
    const MONDAY_11PM_BRT = new Date('2026-10-13T02:00:00.000Z'); // segunda, 23:00 em Brasília
    const MONDAY_9AM_BRT = new Date('2026-10-12T12:00:00.000Z'); // segunda, 09:00 em Brasília
    const TODAY = '2026-10-12'; // businessDate correspondente aos 2 instantes acima.
    // specs/0216 T009 — a regra olha a hora de ABERTURA da sessão (1º horário de fechamento depois
    // dela), então cada sessão de teste precisa de um `openedAt` realista.
    const MONDAY_8AM_OPENED = '2026-10-12T11:00:00.000Z'; // segunda, 08:00 em Brasília

    it('AC-2: fecha a sessão de HOJE de um restaurante elegível cujo horário já passou, com o saldo calculado', async () => {
      const { service, cashRegisterRepository } = setup({
        restaurantRepository: {
          listAll: jest.fn().mockResolvedValue([
            buildRestaurant({ cashRegisterAutoCloseMode: 'automatic', cashRegisterAutoCloseTime: '23:00' }),
          ]),
        },
        cashRegisterRepository: {
          findPendingSessions: jest.fn().mockResolvedValue([buildSession({ businessDate: TODAY, openedAt: MONDAY_8AM_OPENED })]),
          getCalculatedBalance: jest.fn().mockResolvedValue(123.45),
        },
      });

      await service.closeDueAutomaticSessions(MONDAY_11PM_BRT);

      expect(cashRegisterRepository.close).toHaveBeenCalledWith('cr-1', 123.45, 'automatico', true);
    });

    it('AC-3: restaurante elegível sem sessão aberta não faz nada, sem erro', async () => {
      const { service, cashRegisterRepository } = setup({
        restaurantRepository: {
          listAll: jest.fn().mockResolvedValue([
            buildRestaurant({ cashRegisterAutoCloseMode: 'automatic', cashRegisterAutoCloseTime: '23:00' }),
          ]),
        },
        cashRegisterRepository: { findPendingSessions: jest.fn().mockResolvedValue([]) },
      });

      await expect(service.closeDueAutomaticSessions(MONDAY_11PM_BRT)).resolves.toBeUndefined();

      expect(cashRegisterRepository.close).not.toHaveBeenCalled();
    });

    it('não fecha a sessão de HOJE antes do horário configurado chegar', async () => {
      const { service, cashRegisterRepository } = setup({
        restaurantRepository: {
          listAll: jest.fn().mockResolvedValue([
            buildRestaurant({ cashRegisterAutoCloseMode: 'automatic', cashRegisterAutoCloseTime: '23:00' }),
          ]),
        },
        cashRegisterRepository: {
          findPendingSessions: jest.fn().mockResolvedValue([buildSession({ businessDate: TODAY, openedAt: MONDAY_8AM_OPENED })]),
        },
      });

      await service.closeDueAutomaticSessions(MONDAY_9AM_BRT);

      expect(cashRegisterRepository.close).not.toHaveBeenCalled();
    });

    // Achado real de produção (21/11/2026) — antes usava `findOpenSessionByRestaurant` (só
    // "hoje"), então uma sessão deixada aberta de um dia anterior nunca era vista pelo worker e
    // ficava presa pra sempre. specs/0216 T009 — continua fechando no próximo tick: o 1º horário de
    // fechamento depois da abertura dela (sábado 23:00) já passou faz tempo.
    it('fecha uma sessão esquecida aberta há dias no próximo tick', async () => {
      const { service, cashRegisterRepository } = setup({
        restaurantRepository: {
          listAll: jest.fn().mockResolvedValue([
            buildRestaurant({ cashRegisterAutoCloseMode: 'automatic', cashRegisterAutoCloseTime: '23:00' }),
          ]),
        },
        cashRegisterRepository: {
          findPendingSessions: jest.fn().mockResolvedValue([buildSession({ businessDate: '2026-10-10', openedAt: '2026-10-10T21:00:00.000Z' })]),
          getCalculatedBalance: jest.fn().mockResolvedValue(50),
        },
      });

      await service.closeDueAutomaticSessions(MONDAY_9AM_BRT);

      expect(cashRegisterRepository.close).toHaveBeenCalledWith('cr-1', 50, 'automatico', true);
    });

    // specs/0216 T009 — achado real (banco local, 24/11/2026): com o default 04:00 a sessão
    // fechava no tick seguinte à abertura (09:23 → 09:26; 15:32 → 15:33).
    describe('T009: horário de madrugada (04:00) fecha só na madrugada SEGUINTE à abertura', () => {
      const OPENED_0923 = '2026-10-12T12:23:51.000Z'; // segunda, 09:23:51 em Brasília
      function setup0400(openedAt: string, businessDate = TODAY) {
        return setup({
          restaurantRepository: {
            listAll: jest.fn().mockResolvedValue([buildRestaurant({ cashRegisterAutoCloseMode: 'automatic' })]), // sem horário = 04:00
          },
          cashRegisterRepository: {
            findPendingSessions: jest.fn().mockResolvedValue([buildSession({ businessDate, openedAt })]),
            getCalculatedBalance: jest.fn().mockResolvedValue(0),
          },
        });
      }

      it('aberta 09:23 NÃO fecha às 09:26 (o caso real)', async () => {
        const { service, cashRegisterRepository } = setup0400(OPENED_0923);
        await service.closeDueAutomaticSessions(new Date('2026-10-12T12:26:21.000Z'));
        expect(cashRegisterRepository.close).not.toHaveBeenCalled();
      });

      it('aberta 09:23 continua aberta às 23:59 do mesmo dia e às 03:59 do dia seguinte', async () => {
        const { service, cashRegisterRepository } = setup0400(OPENED_0923);
        await service.closeDueAutomaticSessions(new Date('2026-10-13T02:59:00.000Z')); // seg 23:59
        await service.closeDueAutomaticSessions(new Date('2026-10-13T06:59:00.000Z')); // ter 03:59
        expect(cashRegisterRepository.close).not.toHaveBeenCalled();
      });

      it('aberta 09:23 fecha às 04:00 do dia seguinte, com o saldo calculado', async () => {
        const { service, cashRegisterRepository } = setup0400(OPENED_0923);
        await service.closeDueAutomaticSessions(new Date('2026-10-13T07:00:00.000Z')); // ter 04:00
        expect(cashRegisterRepository.close).toHaveBeenCalledWith('cr-1', 0, 'automatico', true);
      });

      it('aberta ontem 18:00 NÃO fecha à meia-noite (antes fechava na troca de data) — só às 04:00', async () => {
        const { service, cashRegisterRepository } = setup0400('2026-10-11T21:00:00.000Z', '2026-10-11'); // dom 18:00
        await service.closeDueAutomaticSessions(new Date('2026-10-12T03:05:00.000Z')); // seg 00:05
        expect(cashRegisterRepository.close).not.toHaveBeenCalled();
        await service.closeDueAutomaticSessions(new Date('2026-10-12T07:00:00.000Z')); // seg 04:00
        expect(cashRegisterRepository.close).toHaveBeenCalledTimes(1);
      });
    });

    it('AC-5: restaurante com fechamento automático desligado (modo manual) nunca fecha sozinho', async () => {
      const { service, cashRegisterRepository } = setup({
        restaurantRepository: {
          listAll: jest.fn().mockResolvedValue([
            buildRestaurant({ cashRegisterAutoCloseMode: 'manual', cashRegisterAutoCloseTime: '23:00' }),
          ]),
        },
      });

      await service.closeDueAutomaticSessions(MONDAY_11PM_BRT);

      expect(cashRegisterRepository.close).not.toHaveBeenCalled();
    });

    it('AC-4: sessão reaberta manualmente pelo dono não é fechada de novo automaticamente', async () => {
      const { service, cashRegisterRepository } = setup({
        restaurantRepository: {
          listAll: jest.fn().mockResolvedValue([
            buildRestaurant({ cashRegisterAutoCloseMode: 'automatic', cashRegisterAutoCloseTime: '23:00' }),
          ]),
        },
        cashRegisterRepository: {
          findPendingSessions: jest.fn().mockResolvedValue([
            buildSession({ businessDate: TODAY, openedAt: MONDAY_8AM_OPENED, reopenedAt: '2026-10-12T15:00:00.000Z', reopenedBy: 'dono-1' }),
          ]),
        },
      });

      await service.closeDueAutomaticSessions(MONDAY_11PM_BRT);

      expect(cashRegisterRepository.close).not.toHaveBeenCalled();
    });

    it('um restaurante com erro não impede o fechamento dos demais', async () => {
      const { service, cashRegisterRepository } = setup({
        restaurantRepository: {
          listAll: jest.fn().mockResolvedValue([
            buildRestaurant({ id: 'r-1', cashRegisterAutoCloseMode: 'automatic', cashRegisterAutoCloseTime: '23:00' }),
            buildRestaurant({ id: 'r-2', cashRegisterAutoCloseMode: 'automatic', cashRegisterAutoCloseTime: '23:00' }),
          ]),
        },
        cashRegisterRepository: {
          findPendingSessions: jest.fn()
            .mockRejectedValueOnce(new Error('falha inesperada'))
            .mockResolvedValueOnce([buildSession({ id: 'cr-2', restaurantId: 'r-2', businessDate: TODAY, openedAt: MONDAY_8AM_OPENED })]),
        },
      });

      await expect(service.closeDueAutomaticSessions(MONDAY_11PM_BRT)).resolves.toBeUndefined();

      expect(cashRegisterRepository.close).toHaveBeenCalledWith('cr-2', 100, 'automatico', true);
    });
  });

  describe('getBalanceByPaymentMethod (AC-6)', () => {
    it('AC-6: 2 vendas Pix (R$ 50 cada) e 1 venda dinheiro (R$ 30) aparecem separadas por forma de pagamento', async () => {
      const { service } = setup({
        orderRepository: {
          findReceivedSalesBetween: jest.fn().mockResolvedValue([
            buildDeliveredOrder({ id: 'o-3', paymentMethod: 'cash', total: 30 }),
          ]),
          // specs/0213-caixa-pix-na-confirmacao — Pix conta por `findConfirmedPixSalesBetween`
          // (gatilho "confirmado"), não por `findReceivedSalesBetween` ("entregue").
          findConfirmedPixSalesBetween: jest.fn().mockResolvedValue([
            buildDeliveredOrder({ id: 'o-1', paymentMethod: 'pix', total: 50 }),
            buildDeliveredOrder({ id: 'o-2', paymentMethod: 'pix', total: 50 }),
          ]),
        },
      });

      const balance = await service.getBalanceByPaymentMethod('cr-1');

      expect(balance).toMatchObject({ pix: 100, cash: 30, creditCard: 0, debitCard: 0 });
    });

    it('pedidos não entregues não entram na soma', async () => {
      const { service } = setup({
        orderRepository: {
          findReceivedSalesBetween: jest.fn().mockResolvedValue([
            buildDeliveredOrder({ id: 'o-1', status: 'aguardandoConfirmacao', paymentMethod: 'pix', total: 50 }),
          ]),
        },
      });

      const balance = await service.getBalanceByPaymentMethod('cr-1');

      expect(balance.pix).toBe(0);
    });

    it('pagamento de mesa entra pela forma de cada pagamento recebido na sessão', async () => {
      const { service } = setup({
        orderRepository: {
          findReceivedSalesBetween: jest.fn().mockResolvedValue([
            buildDeliveredOrder({
              id: 'o-mesa',
              orderType: 'table',
              status: 'confirmado',
              paymentMethod: 'pix',
              total: 115,
              tablePayments: [
                { id: 'pay-cash', method: 'cash', amount: 4, paidAt: '2026-09-09T10:00:00.000Z' },
                { id: 'pay-card', method: 'creditCard', amount: 12, paidAt: '2026-09-09T11:00:00.000Z' },
                { id: 'pay-old', method: 'debitCard', amount: 99, paidAt: '2026-09-08T10:00:00.000Z' },
              ],
            }),
          ]),
        },
      });

      const balance = await service.getBalanceByPaymentMethod('cr-1');

      expect(balance).toMatchObject({ cash: 4, creditCard: 12, debitCard: 0, pix: 0 });
    });

    it('syncOpenSession lança movimento para pagamento de mesa e para delivery ainda não lançados', async () => {
      const { cashRegisterRepository, service } = setup({
        orderRepository: {
          findReceivedSalesBetween: jest.fn().mockResolvedValue([
            buildDeliveredOrder({
              id: 'o-mesa',
              orderNumber: 8,
              orderType: 'table',
              tablePayments: [{ id: 'pay-1', method: 'cash', amount: 16, paidAt: '2026-09-09T10:00:00.000Z' }],
            }),
            buildDeliveredOrder({ id: 'o-delivery', orderNumber: 9, orderType: 'delivery', paymentMethod: 'creditCard', total: 4 }),
          ]),
        },
      });

      await service.syncOpenSession('r-1');

      expect(cashRegisterRepository.addMovement).toHaveBeenCalledTimes(2);
      expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-1', expect.objectContaining({
        type: 'entrada', amount: 16, paymentId: 'pay-1', paymentMethod: 'cash', orderId: 'o-mesa',
      }));
      expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-1', expect.objectContaining({
        type: 'entrada', amount: 4, paymentMethod: 'creditCard', orderId: 'o-delivery',
      }));
    });

    // Pedido explícito do usuário (follow-up, achado real 06/11/2026) — inverte o teste "0176"
    // antigo: enquanto o caixa de ontem segue aberto (ninguém fechou ainda), um pagamento recebido
    // hoje de madrugada pertence a ele também, não só o de ontem — ver cabeçalho de
    // `cashRegisterPeriodEnd`.
    it('caixa pendente ainda aberto sincroniza pagamentos de antes E depois da virada do dia', async () => {
      const { service, orderRepository, cashRegisterRepository } = setup({
        cashRegisterRepository: { findById: jest.fn().mockResolvedValue(buildSession({ openedAt: '2026-09-08T11:00:00Z' })) },
        orderRepository: { findReceivedSalesBetween: jest.fn().mockResolvedValue([
          buildDeliveredOrder({ orderType: 'table', tablePayments: [
            { id: 'old', method: 'pix', amount: 10, paidAt: '2026-09-08T12:00:00Z' },
            { id: 'today', method: 'pix', amount: 20, paidAt: '2026-09-09T10:00:00Z' },
          ] }),
        ]) },
      });
      await service.syncOpenSession('r-1', 'cr-1');
      // `now` travado em 2026-09-09T12:00:00Z pelo `beforeEach` — sessão ainda aberta soma até lá, sem teto de meia-noite.
      expect(orderRepository.findReceivedSalesBetween).toHaveBeenCalledWith('r-1', new Date('2026-09-08T11:00:00Z'), new Date('2026-09-09T12:00:00Z'));
      expect(cashRegisterRepository.addMovement).toHaveBeenCalledTimes(2);
      expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-1', expect.objectContaining({ paymentId: 'old', amount: 10 }));
      expect(cashRegisterRepository.addMovement).toHaveBeenCalledWith('cr-1', expect.objectContaining({ paymentId: 'today', amount: 20 }));
    });

    it('movimento manual (sangria) sem orderId reduz a forma "dinheiro", sem duplicar venda automática de Pix', async () => {
      const { service } = setup({
        orderRepository: {
          // specs/0213-caixa-pix-na-confirmacao — Pix agora conta por `findConfirmedPixSalesBetween`
          // (gatilho "confirmado"), não por `findReceivedSalesBetween` ("entregue").
          findConfirmedPixSalesBetween: jest.fn().mockResolvedValue([buildDeliveredOrder({ id: 'o-1', paymentMethod: 'pix', total: 50 })]),
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

    // (achado real, pedido explícito do usuário) — "Vendas de mesa e balcão"/"Vendas de
    // delivery/retirada" também precisam aparecer no histórico de fechamentos, não só em
    // "Movimento do dia" (que já usa `getTableSalesBetween`/`getDeliverySalesBetween` à parte).
    it('getClosingSummary separa tableSales de deliverySales, mesa/balcão e delivery/retirada no mesmo período', async () => {
      const { service } = setup({
        orderRepository: {
          findReceivedSalesBetween: jest.fn().mockResolvedValue([
            buildDeliveredOrder({ id: 'o-delivery-2', orderType: 'pickup', paymentMethod: 'cash', total: 20 }),
            buildDeliveredOrder({
              id: 'o-mesa', orderType: 'table', status: 'confirmado', paymentMethod: 'pix', total: 16,
              tablePayments: [{ id: 'pay-1', method: 'cash', amount: 16, paidAt: '2026-09-09T10:00:00.000Z' }],
            }),
          ]),
          // specs/0213-caixa-pix-na-confirmacao — Pix conta por `findConfirmedPixSalesBetween`
          // (gatilho "confirmado"), não por `findReceivedSalesBetween` ("entregue").
          findConfirmedPixSalesBetween: jest.fn().mockResolvedValue([
            buildDeliveredOrder({ id: 'o-delivery-1', orderType: 'delivery', paymentMethod: 'pix', total: 50 }),
          ]),
        },
      });

      const summary = await service.getClosingSummary('cr-1');

      expect(summary.deliverySales).toBe(70);
      expect(summary.tableSales).toBe(16);
      expect(summary.totalSales).toBe(86);
    });

    // Pedido explícito do usuário (follow-up, achado real 06/11/2026) — reproduz o cenário real:
    // caixa aberto numa noite, pedido entregue já de madrugada (depois da meia-noite), caixa só
    // fechado de manhã. Antes da correção, `cashRegisterPeriodEnd` travava o período na meia-noite
    // e esse pedido ficava fora de `findReceivedSalesBetween` — aqui o repositório mockado já
    // devolve o pedido (simulando a query real corrigida); o teste garante que `getClosingSummary`
    // soma ele normalmente, sem nenhum teto aplicado por cima.
    it('soma venda entregue de madrugada, depois da meia-noite, com o caixa aberto desde a noite anterior', async () => {
      const { service } = setup({
        cashRegisterRepository: {
          findById: jest.fn().mockResolvedValue(buildSession({ openedAt: '2026-09-08T20:00:00.000Z' })), // aberto às 17h de ontem (SP)
        },
        orderRepository: {
          // "agora" travado em 2026-09-09T12:00:00Z (09h da manhã em SP) pelo `beforeEach` —
          // pedido entregue de madrugada, bem depois da virada de dia.
          findReceivedSalesBetween: jest.fn().mockResolvedValue([
            buildDeliveredOrder({ id: 'o-madrugada', orderType: 'delivery', paymentMethod: 'cash', total: 55 }),
          ]),
        },
      });

      const summary = await service.getClosingSummary('cr-1');

      expect(summary.deliverySales).toBe(55);
      expect(summary.totalSales).toBe(55);
      expect(summary.balanceByPaymentMethod.cash).toBe(55);
    });

    // Pedido explícito do usuário (follow-up, achado real 06/11/2026) — venda automática lançada
    // num caixa JÁ FECHADO (`addAutomaticEntry`, caso 2): fica de fora do saldo/diferença já
    // conferidos (não pode mudar retroativamente), mas aparece em `lateMovements`, nunca escondida.
    it('getClosingSummary separa lançamento posterior ao fechamento em lateMovements, fora da conferência', async () => {
      const closedAt = '2026-09-09T09:13:56.000Z';
      const { service } = setup({
        cashRegisterRepository: {
          findById: jest.fn().mockResolvedValue(buildSession({ status: 'fechado', closedAt, closingBalance: 100 })),
          getCalculatedBalance: jest.fn().mockResolvedValue(100), // já exclui o tardio (testado à parte no repositório)
          listMovements: jest.fn().mockResolvedValue([
            { id: 'mv-antes', cashRegisterSessionId: 'cr-1', type: 'entrada', amount: 100, description: 'Venda #1 (Pix)', orderId: 'o-1', paymentMethod: 'pix', createdAt: '2026-09-09T08:00:00.000Z' },
            { id: 'mv-depois', cashRegisterSessionId: 'cr-1', type: 'entrada', amount: 7, description: 'Venda #8 (Dinheiro)', orderId: 'o-8', paymentMethod: 'cash', createdAt: '2026-09-09T09:14:10.000Z' },
          ]),
        },
      });

      const summary = await service.getClosingSummary('cr-1');

      expect(summary.lateMovements).toHaveLength(1);
      expect(summary.lateMovements[0]).toMatchObject({ id: 'mv-depois', amount: 7 });
      // `balanceByPaymentMethod.cash` só reflete lançamentos manuais (`!movement.orderId`) de
      // antes do fechamento — nenhum dos dois acima é manual, então fica em 0 mesmo com o tardio.
      expect(summary.balanceByPaymentMethod.cash).toBe(0);
      expect(summary.calculatedBalance).toBe(100);
      expect(summary.difference).toBe(0);
    });

    it('sessão ainda aberta nunca tem lateMovements, mesmo com lançamentos recentes', async () => {
      const { service } = setup({
        cashRegisterRepository: {
          findById: jest.fn().mockResolvedValue(buildSession({ status: 'aberto' })),
          listMovements: jest.fn().mockResolvedValue([
            { id: 'mv-1', cashRegisterSessionId: 'cr-1', type: 'entrada', amount: 7, description: 'Venda #8 (Dinheiro)', orderId: 'o-8', paymentMethod: 'cash', createdAt: '2026-09-09T11:59:59.000Z' },
          ]),
        },
      });

      const summary = await service.getClosingSummary('cr-1');

      expect(summary.lateMovements).toEqual([]);
    });

    // specs/0213-caixa-pix-na-confirmacao REQ-6/AC-6 — pedido Pix confirmado dentro do período
    // mas ainda não entregue (nem cancelado) soma normalmente, mesmo nunca aparecendo em
    // `findReceivedSalesBetween` (que só traz pedidos já "entregue").
    it('specs/0213 AC-6: pedido Pix confirmado mas ainda não entregue entra em totalSales/salesByPaymentMethod.pix/deliverySales', async () => {
      const { service } = setup({
        orderRepository: {
          findConfirmedPixSalesBetween: jest.fn().mockResolvedValue([
            buildDeliveredOrder({ id: 'o-1', status: 'emPreparo', paymentMethod: 'pix', total: 50 }),
          ]),
        },
      });

      const summary = await service.getClosingSummary('cr-1');

      expect(summary.totalSales).toBe(50);
      expect(summary.deliverySales).toBe(50);
      expect(summary.balanceByPaymentMethod.pix).toBe(50);
    });

    // specs/0213 REQ-6 — pedido Pix confirmado e depois cancelado some do resumo: no ledger real
    // a entrada e o estorno têm `orderId`, então nenhum dos dois é somado pelo loop de movimentos
    // manuais; não somar aqui (nem a entrada, nem o estorno) mantém o total batendo com zero
    // líquido.
    it('specs/0213 REQ-6: pedido Pix confirmado e cancelado depois soma zero no resumo', async () => {
      const { service } = setup({
        orderRepository: {
          findConfirmedPixSalesBetween: jest.fn().mockResolvedValue([
            buildDeliveredOrder({ id: 'o-1', status: 'cancelado', paymentMethod: 'pix', total: 50 }),
          ]),
        },
      });

      const summary = await service.getClosingSummary('cr-1');

      expect(summary.totalSales).toBe(0);
      expect(summary.deliverySales).toBe(0);
      expect(summary.balanceByPaymentMethod.pix).toBe(0);
    });

    // specs/0213 REQ-6 — um pedido Pix que JÁ chegou em "entregue" aparece nas duas buscas
    // (`findReceivedSalesBetween` por status "entregue", `findConfirmedPixSalesBetween` por
    // "confirmado" no período); precisa contar só uma vez.
    it('specs/0213 REQ-6: pedido Pix entregue não conta duas vezes mesmo aparecendo nas duas buscas', async () => {
      const { service } = setup({
        orderRepository: {
          findReceivedSalesBetween: jest.fn().mockResolvedValue([
            buildDeliveredOrder({ id: 'o-1', status: 'entregue', paymentMethod: 'pix', total: 50 }),
          ]),
          findConfirmedPixSalesBetween: jest.fn().mockResolvedValue([
            buildDeliveredOrder({ id: 'o-1', status: 'entregue', paymentMethod: 'pix', total: 50 }),
          ]),
        },
      });

      const summary = await service.getClosingSummary('cr-1');

      expect(summary.totalSales).toBe(50);
      expect(summary.balanceByPaymentMethod.pix).toBe(50);
    });
  });
});
