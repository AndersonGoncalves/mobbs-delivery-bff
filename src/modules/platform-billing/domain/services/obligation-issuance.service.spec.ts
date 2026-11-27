import { localMidnight } from '../billing-calendar';
import type { IBillingPayer } from '../entities/billing-payer.entity';
import type { ISubscriptionObligation } from '../entities/subscription-obligation.entity';
import { ObligationIssuanceService } from './obligation-issuance.service';

function buildObligation(overrides: Partial<ISubscriptionObligation> = {}): ISubscriptionObligation {
  return {
    id: 'ob-1', restaurantId: 'r-1', kind: 'monthly', referenceMonth: '2026-10', tier: 'pro', settingsVersionId: 'v1',
    amountCents: 7990, status: 'awaiting_issue', dueDate: localMidnight(new Date('2026-11-10T12:00:00Z')),
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

function buildPayer(overrides: Partial<IBillingPayer> = {}): IBillingPayer {
  return {
    id: 'payer-1', restaurantId: 'r-1', asaasCustomerId: 'cus_1', legalName: 'Prime Pizza', document: '12345678000190',
    email: 'dono@primepizza.com', phone: '11999999999',
    address: { street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', zipCode: '01000000' },
    completedAt: new Date('2026-10-01T00:00:00Z'), createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

function setup(options: { eligible: ISubscriptionObligation[]; payer?: IBillingPayer | null }) {
  const obligationRepository = {
    findEligibleForIssuance: jest.fn().mockResolvedValue(options.eligible),
    markIssued: jest.fn().mockImplementation(async (id, data, now) => buildObligation({ id, status: 'pending', asaasChargeId: data.asaasChargeId, pixPayload: data.pixPayload, issuedAt: now })),
    markIssueFailed: jest.fn().mockImplementation(async (id, reason) => buildObligation({ id, status: 'issue_failed', issueFailureReason: reason })),
  };
  const billingPayerRepository = { findByRestaurantId: jest.fn().mockResolvedValue('payer' in options ? options.payer : buildPayer()) };
  const pixAvailabilityExceptionRepository = { createIfAbsent: jest.fn().mockResolvedValue({ id: 'exc-1' }), findByObligationId: jest.fn() };
  const asaasClient = {
    createPixCharge: jest.fn().mockResolvedValue({ id: 'pay_1', status: 'PENDING' }),
    getPixQrCode: jest.fn().mockResolvedValue({ payload: '00020126...copia-e-cola' }),
    findPaymentByExternalReference: jest.fn().mockResolvedValue(null),
  };
  const service = new ObligationIssuanceService({ obligationRepository, billingPayerRepository, pixAvailabilityExceptionRepository, asaasClient } as never);
  return { service, obligationRepository, billingPayerRepository, pixAvailabilityExceptionRepository, asaasClient };
}

describe('ObligationIssuanceService.issuePending', () => {
  it('emite a cobrança real e persiste chargeId/pixPayload', async () => {
    const obligation = buildObligation();
    const { service, asaasClient, obligationRepository } = setup({ eligible: [obligation] });

    await service.issuePending(new Date('2026-11-01T12:00:00Z'));

    expect(asaasClient.createPixCharge).toHaveBeenCalledWith('cus_1', 79.9, '2026-11-10', 'ob-1');
    expect(obligationRepository.markIssued).toHaveBeenCalledWith('ob-1', { asaasChargeId: 'pay_1', pixPayload: '00020126...copia-e-cola' }, expect.any(Date));
  });

  it('REQ-11: busca a cobrança existente antes de criar — reinício no meio da emissão não duplica', async () => {
    const obligation = buildObligation();
    const { service, asaasClient } = setup({ eligible: [obligation] });
    asaasClient.findPaymentByExternalReference.mockResolvedValue({ id: 'pay_already_created' });

    await service.issuePending(new Date('2026-11-01T12:00:00Z'));

    expect(asaasClient.createPixCharge).not.toHaveBeenCalled();
    expect(asaasClient.getPixQrCode).toHaveBeenCalledWith('pay_already_created');
  });

  it('REQ-4: pagador sem cadastro completo não tenta emitir — fica como pendência acionável', async () => {
    const { service, obligationRepository, asaasClient } = setup({ eligible: [buildObligation()], payer: null });

    await service.issuePending(new Date('2026-11-01T12:00:00Z'));

    expect(asaasClient.createPixCharge).not.toHaveBeenCalled();
    expect(obligationRepository.markIssueFailed).toHaveBeenCalledWith('ob-1', expect.stringContaining('pagador'), expect.any(Date));
  });

  it('REQ-12: falha de uma obligation não impede o processamento das demais do lote', async () => {
    const failing = buildObligation({ id: 'ob-fail' });
    const ok = buildObligation({ id: 'ob-ok' });
    const { service, asaasClient, obligationRepository } = setup({ eligible: [failing, ok] });
    asaasClient.createPixCharge.mockRejectedValueOnce(new Error('Asaas API respondeu 500')).mockResolvedValueOnce({ id: 'pay_2', status: 'PENDING' });

    await service.issuePending(new Date('2026-11-01T12:00:00Z'));

    expect(obligationRepository.markIssueFailed).toHaveBeenCalledWith('ob-fail', 'Asaas API respondeu 500', expect.any(Date));
    expect(obligationRepository.markIssued).toHaveBeenCalledWith('ob-ok', expect.anything(), expect.any(Date));
  });

  it('AC-5: Pix só disponibilizado depois do vencimento cria a exceção de 3 dias (sem alterar o vencimento)', async () => {
    const obligation = buildObligation({ dueDate: localMidnight(new Date('2026-11-10T12:00:00Z')) });
    const { service, pixAvailabilityExceptionRepository } = setup({ eligible: [obligation] });

    // "agora" é 12/11 — já passou o dia seguinte ao vencimento (11/11 00:00).
    await service.issuePending(new Date('2026-11-12T15:00:00Z'));

    expect(pixAvailabilityExceptionRepository.createIfAbsent).toHaveBeenCalledWith(
      'ob-1', new Date('2026-11-12T15:00:00Z'), new Date('2026-11-15T15:00:00Z'),
    );
  });

  it('emissão dentro do prazo normal nunca cria exceção', async () => {
    const obligation = buildObligation({ dueDate: localMidnight(new Date('2026-11-10T12:00:00Z')) });
    const { service, pixAvailabilityExceptionRepository } = setup({ eligible: [obligation] });

    await service.issuePending(new Date('2026-11-01T12:00:00Z'));

    expect(pixAvailabilityExceptionRepository.createIfAbsent).not.toHaveBeenCalled();
  });

  describe('specs/0175 T043 — logs da emissão', () => {
    let log: jest.SpyInstance;
    let warn: jest.SpyInstance;
    let error: jest.SpyInstance;
    beforeEach(() => {
      log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('emissão com sucesso registra a obrigação e a cobrança do Asaas', async () => {
      const { service } = setup({ eligible: [buildObligation()] });

      await service.issuePending(new Date('2026-11-01T12:00:00Z'));

      expect(log).toHaveBeenCalledWith(expect.stringMatching(/\[platform-billing\] Pix emitido: obrigação ob-1 \(monthly, restaurante r-1, R\$ 79\.90, vence .*\) — cobrança Asaas pay_1$/));
    });

    it('pagador incompleto registra aviso (antes só ia para o banco)', async () => {
      const { service } = setup({ eligible: [buildObligation()], payer: null });

      await service.issuePending(new Date('2026-11-01T12:00:00Z'));

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Pix não emitido: obrigação ob-1'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('cadastro do pagador incompleto'));
    });

    it('falha do Asaas registra erro com o motivo (antes só ia para o banco)', async () => {
      const { service, asaasClient } = setup({ eligible: [buildObligation()] });
      asaasClient.getPixQrCode.mockRejectedValueOnce(new Error('Asaas API respondeu 404'));

      await service.issuePending(new Date('2026-11-01T12:00:00Z'));

      expect(error).toHaveBeenCalledWith(expect.stringContaining('falha ao emitir o Pix: obrigação ob-1'));
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Asaas API respondeu 404 (nova tentativa no próximo ciclo)'));
    });
  });
});
