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
    recordAsaasCharge: jest.fn().mockResolvedValue(undefined),
  };
  const billingPayerRepository = { findByRestaurantId: jest.fn().mockResolvedValue('payer' in options ? options.payer : buildPayer()) };
  const pixAvailabilityExceptionRepository = { createIfAbsent: jest.fn().mockResolvedValue({ id: 'exc-1' }), findByObligationId: jest.fn() };
  const asaasClient = {
    createPixCharge: jest.fn().mockResolvedValue({ id: 'pay_1', status: 'PENDING' }),
    getPixQrCode: jest.fn().mockResolvedValue({ payload: '00020126...copia-e-cola' }),
    listPaymentsByExternalReference: jest.fn().mockResolvedValue([]),
  };
  const service = new ObligationIssuanceService({ obligationRepository, billingPayerRepository, pixAvailabilityExceptionRepository, asaasClient } as never);
  return { service, obligationRepository, billingPayerRepository, pixAvailabilityExceptionRepository, asaasClient };
}

describe('ObligationIssuanceService.issuePending', () => {
  it('emite a cobrança real e persiste chargeId/pixPayload', async () => {
    const obligation = buildObligation();
    const { service, asaasClient, obligationRepository } = setup({ eligible: [obligation] });

    await service.issuePending(new Date('2026-11-01T12:00:00Z'));

    expect(asaasClient.createPixCharge).toHaveBeenCalledWith('cus_1', 79.9, '2026-11-10', 'ob-1', expect.stringMatching(/^BsDelivery — /));
    expect(obligationRepository.markIssued).toHaveBeenCalledWith('ob-1', { asaasChargeId: 'pay_1', pixPayload: '00020126...copia-e-cola' }, expect.any(Date));
  });

  it('REQ-11: busca a cobrança existente antes de criar — reinício no meio da emissão não duplica', async () => {
    const obligation = buildObligation();
    const { service, asaasClient } = setup({ eligible: [obligation] });
    asaasClient.listPaymentsByExternalReference.mockResolvedValue([{ id: 'pay_already_created', status: 'PENDING' }]);

    await service.issuePending(new Date('2026-11-01T12:00:00Z'));

    expect(asaasClient.createPixCharge).not.toHaveBeenCalled();
    expect(asaasClient.getPixQrCode).toHaveBeenCalledWith('pay_already_created');
  });

  // specs/0175 T054 — achado na homologação (28/11/2026, hamburgueria).
  it('T054: grava o id da cobrança ANTES do QR; QR com erro do Asaas registra o motivo legível', async () => {
    const { service, asaasClient, obligationRepository } = setup({ eligible: [buildObligation()] });
    asaasClient.getPixQrCode.mockRejectedValue(
      new Error('Asaas API (GET /payments/pay_1/pixQrCode) respondeu 400: {"errors":[{"code":"invalid_action","description":"Ocorreu um erro desconhecido. Por favor, tente novamente."}]}'),
    );
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await service.issuePending(new Date('2026-11-01T12:00:00Z'));

    expect(obligationRepository.recordAsaasCharge).toHaveBeenCalledWith('ob-1', 'pay_1');
    expect(obligationRepository.markIssued).not.toHaveBeenCalled();
    expect(obligationRepository.markIssueFailed).toHaveBeenCalledWith(
      'ob-1',
      'Cobrança pay_1 criada no Asaas, mas o QR do Pix não foi gerado: o Asaas respondeu "Ocorreu um erro desconhecido. Por favor, tente novamente."',
      expect.any(Date),
    );
  });

  it('T054: QR sem resposta a tempo vira "o Asaas não respondeu a tempo"; cobrança já gravada não é regravada', async () => {
    const { service, asaasClient, obligationRepository } = setup({ eligible: [buildObligation({ asaasChargeId: 'pay_old', status: 'issue_failed' })] });
    asaasClient.listPaymentsByExternalReference.mockResolvedValue([{ id: 'pay_old', status: 'PENDING' }]);
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    asaasClient.getPixQrCode.mockRejectedValue(timeout);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await service.issuePending(new Date('2026-11-01T12:00:00Z'));

    expect(obligationRepository.recordAsaasCharge).not.toHaveBeenCalled();
    expect(obligationRepository.markIssueFailed).toHaveBeenCalledWith('ob-1', 'Cobrança pay_old criada no Asaas, mas o QR do Pix não foi gerado: o Asaas não respondeu a tempo', expect.any(Date));
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

  describe('specs/0175 REQ-23 (opção C) — fatura reaberta por "Cobrar de novo"', () => {
    beforeEach(() => jest.spyOn(console, 'log').mockImplementation(() => undefined));
    afterEach(() => jest.restoreAllMocks());

    it('AC-17b: nunca reaproveita a cobrança estornada — cria uma cobrança NOVA', async () => {
      const obligation = buildObligation({ refundedChargeIds: ['pay_estornado'] });
      const { service, asaasClient, obligationRepository } = setup({ eligible: [obligation] });
      asaasClient.listPaymentsByExternalReference.mockResolvedValue([{ id: 'pay_estornado', status: 'REFUNDED' }]);
      asaasClient.createPixCharge.mockResolvedValue({ id: 'pay_novo', status: 'PENDING' });

      await service.issuePending(new Date('2026-11-01T12:00:00Z'));

      expect(asaasClient.createPixCharge).toHaveBeenCalledTimes(1);
      expect(obligationRepository.markIssued).toHaveBeenCalledWith('ob-1', expect.objectContaining({ asaasChargeId: 'pay_novo' }), expect.any(Date));
    });

    it('AC-17b: cobrança estornada é ignorada mesmo se o Asaas ainda não marcou como REFUNDED (está em refundedChargeIds)', async () => {
      const obligation = buildObligation({ refundedChargeIds: ['pay_estornado'] });
      const { service, asaasClient } = setup({ eligible: [obligation] });
      asaasClient.listPaymentsByExternalReference.mockResolvedValue([{ id: 'pay_estornado', status: 'RECEIVED' }]);

      await service.issuePending(new Date('2026-11-01T12:00:00Z'));

      expect(asaasClient.createPixCharge).toHaveBeenCalledTimes(1);
    });

    it('REQ-11: reinício no meio da reemissão reaproveita a cobrança NOVA já criada, sem duplicar', async () => {
      const obligation = buildObligation({ refundedChargeIds: ['pay_estornado'] });
      const { service, asaasClient, obligationRepository } = setup({ eligible: [obligation] });
      asaasClient.listPaymentsByExternalReference.mockResolvedValue([
        { id: 'pay_estornado', status: 'REFUNDED' },
        { id: 'pay_novo', status: 'PENDING' },
      ]);

      await service.issuePending(new Date('2026-11-01T12:00:00Z'));

      expect(asaasClient.createPixCharge).not.toHaveBeenCalled();
      expect(obligationRepository.markIssued).toHaveBeenCalledWith('ob-1', expect.objectContaining({ asaasChargeId: 'pay_novo' }), expect.any(Date));
    });
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
