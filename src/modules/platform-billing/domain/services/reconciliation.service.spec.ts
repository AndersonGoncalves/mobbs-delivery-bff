import { localMidnight } from '../billing-calendar';
import type { ISubscriptionObligation } from '../entities/subscription-obligation.entity';
import { ReconciliationService } from './reconciliation.service';

function buildObligation(overrides: Partial<ISubscriptionObligation> = {}): ISubscriptionObligation {
  return {
    id: 'ob-1', restaurantId: 'r-1', kind: 'monthly', referenceMonth: '2026-10', tier: 'pro', settingsVersionId: 'v1',
    amountCents: 7990, status: 'pending', asaasChargeId: 'pay_1', dueDate: localMidnight(new Date('2026-11-10T12:00:00Z')),
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

function setup(options: { obligations: ISubscriptionObligation[] }) {
  const obligationRepository = {
    findPendingForReconciliation: jest.fn().mockResolvedValue(options.obligations),
    findById: jest.fn().mockImplementation(async (id: string) => options.obligations.find((o) => o.id === id) ?? null),
    markPaid: jest.fn().mockImplementation(async (id, paidAt) => buildObligation({ id, status: 'paid', paidAt })),
    markOverdue: jest.fn().mockImplementation(async (id) => buildObligation({ id, status: 'overdue' })),
    markRefunded: jest.fn().mockImplementation(async (id) => buildObligation({ id, status: 'refunded' })),
  };
  const subscriptionEventRepository = { append: jest.fn().mockResolvedValue({ event: { id: 'ev-1' }, wasAlreadyRecorded: false }) };
  const asaasClient = { getPayment: jest.fn() };
  const service = new ReconciliationService({ obligationRepository, subscriptionEventRepository, asaasClient } as never);
  return { service, obligationRepository, subscriptionEventRepository, asaasClient };
}

describe('ReconciliationService.reconcile', () => {
  it('AC-16: pagamento confirmado durante indisponibilidade (webhook perdido) é recuperado e marca paid', async () => {
    const obligation = buildObligation({ status: 'pending' });
    const { service, obligationRepository, asaasClient } = setup({ obligations: [obligation] });
    asaasClient.getPayment.mockResolvedValue({ id: 'pay_1', status: 'RECEIVED' });

    await service.reconcile(new Date('2026-11-12T00:00:00Z'));

    expect(asaasClient.getPayment).toHaveBeenCalledWith('pay_1');
    expect(obligationRepository.markPaid).toHaveBeenCalledWith('ob-1', new Date('2026-11-12T00:00:00Z'));
  });

  it('AC-16: duas vencidas e só uma paga — a não paga permanece sem mudança (sem marcar paid)', async () => {
    const unpaid = buildObligation({ id: 'ob-unpaid', status: 'overdue', asaasChargeId: 'pay_unpaid' });
    const paid = buildObligation({ id: 'ob-paid', status: 'pending', asaasChargeId: 'pay_paid' });
    const { service, obligationRepository, asaasClient } = setup({ obligations: [unpaid, paid] });
    asaasClient.getPayment.mockImplementation(async (chargeId: string) => ({
      id: chargeId,
      status: chargeId === 'pay_paid' ? 'CONFIRMED' : 'OVERDUE',
    }));

    await service.reconcile(new Date('2026-11-12T00:00:00Z'));

    expect(obligationRepository.markPaid).toHaveBeenCalledTimes(1);
    expect(obligationRepository.markPaid).toHaveBeenCalledWith('ob-paid', expect.any(Date));
    expect(obligationRepository.markPaid).not.toHaveBeenCalledWith('ob-unpaid', expect.anything());
  });

  it('AC-17: estorno total representa o saldo real, sem falsa quitação', async () => {
    const obligation = buildObligation({ status: 'paid' });
    const { service, obligationRepository, asaasClient } = setup({ obligations: [obligation] });
    asaasClient.getPayment.mockResolvedValue({ id: 'pay_1', status: 'REFUNDED' });

    await service.reconcile(new Date('2026-11-12T00:00:00Z'));

    expect(obligationRepository.markRefunded).toHaveBeenCalledWith('ob-1');
  });

  it('registra o evento de reconciliação mesmo quando nada muda (PENDING continua PENDING)', async () => {
    const obligation = buildObligation({ status: 'pending' });
    const { service, subscriptionEventRepository, asaasClient, obligationRepository } = setup({ obligations: [obligation] });
    asaasClient.getPayment.mockResolvedValue({ id: 'pay_1', status: 'PENDING' });

    await service.reconcile(new Date('2026-11-05T00:00:00Z'));

    expect(subscriptionEventRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({ obligationId: 'ob-1', type: 'reconciled', payload: { status: 'PENDING' } }),
    );
    expect(obligationRepository.markPaid).not.toHaveBeenCalled();
  });

  it('REQ-26: reconciliação sob demanda de uma obligation específica (botão "Verificar pagamento")', async () => {
    const obligation = buildObligation({ id: 'ob-specific', status: 'pending' });
    const { service, obligationRepository, asaasClient } = setup({ obligations: [obligation] });
    asaasClient.getPayment.mockResolvedValue({ id: 'pay_1', status: 'CONFIRMED' });

    await service.reconcile(new Date('2026-11-05T00:00:00Z'), { obligationId: 'ob-specific' });

    expect(obligationRepository.findPendingForReconciliation).not.toHaveBeenCalled();
    expect(obligationRepository.markPaid).toHaveBeenCalledWith('ob-specific', expect.any(Date));
  });

  it('obligation sem chargeId (nunca emitida) é ignorada, sem chamar o Asaas', async () => {
    const obligation = buildObligation({ asaasChargeId: undefined });
    const { service, asaasClient } = setup({ obligations: [obligation] });

    await service.reconcile(new Date('2026-11-05T00:00:00Z'));

    expect(asaasClient.getPayment).not.toHaveBeenCalled();
  });
});
