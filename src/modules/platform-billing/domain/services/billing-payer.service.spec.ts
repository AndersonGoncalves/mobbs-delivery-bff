import type { IBillingPayer, IBillingPayerAddress } from '../entities/billing-payer.entity';
import { BillingPayerService, type CompletePayerInput } from './billing-payer.service';

function buildAddress(overrides: Partial<IBillingPayerAddress> = {}): IBillingPayerAddress {
  return { street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', zipCode: '01000000', ...overrides };
}

function buildInput(overrides: Partial<CompletePayerInput> = {}): CompletePayerInput {
  return {
    legalName: 'Prime Pizza', document: '12345678000190', email: 'dono@primepizza.com', phone: '11999999999',
    address: buildAddress(), ...overrides,
  };
}

function buildPayer(overrides: Partial<IBillingPayer> = {}): IBillingPayer {
  return {
    id: 'payer-1', restaurantId: 'r-1', asaasCustomerId: 'cus_existente', legalName: 'Prime Pizza', document: '12345678000190',
    email: 'dono@primepizza.com', phone: '11999999999', address: buildAddress(), completedAt: new Date('2026-10-01T00:00:00Z'),
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

function setup(options: { existing?: IBillingPayer | null } = {}) {
  const billingPayerRepository = {
    findByRestaurantId: jest.fn().mockResolvedValue(options.existing ?? null),
    save: jest.fn().mockImplementation(async (restaurantId, data) => buildPayer({ restaurantId, ...data })),
  };
  const asaasClient = { createCustomer: jest.fn().mockResolvedValue({ id: 'cus_novo' }) };
  const service = new BillingPayerService({ billingPayerRepository, asaasClient });
  return { service, billingPayerRepository, asaasClient };
}

describe('BillingPayerService.completePayer (specs/0175-cobranca-assinatura-asaas REQ-1/REQ-3/REQ-4)', () => {
  it('sem pagador existente, cria o cliente na Asaas e persiste o asaasCustomerId recém-criado', async () => {
    const { service, asaasClient, billingPayerRepository } = setup({ existing: null });
    const now = new Date('2026-11-09T12:00:00Z');

    const result = await service.completePayer('r-1', buildInput(), now);

    expect(asaasClient.createCustomer).toHaveBeenCalledWith('Prime Pizza', '12345678000190');
    expect(billingPayerRepository.save).toHaveBeenCalledWith('r-1', expect.objectContaining({ asaasCustomerId: 'cus_novo', completedAt: now }));
    expect(result.asaasCustomerId).toBe('cus_novo');
  });

  // REQ-3 — "falha do Asaas não deve... duplicar": com um IBillingPayer local já existente, reusa
  // o asaasCustomerId persistido, nunca chama createCustomer de novo.
  it('com pagador já existente, reusa o asaasCustomerId local e nunca chama createCustomer de novo', async () => {
    const existing = buildPayer({ asaasCustomerId: 'cus_existente' });
    const { service, asaasClient, billingPayerRepository } = setup({ existing });
    const now = new Date('2026-11-09T12:00:00Z');

    const result = await service.completePayer('r-1', buildInput({ legalName: 'Prime Pizza Ltda' }), now);

    expect(asaasClient.createCustomer).not.toHaveBeenCalled();
    expect(billingPayerRepository.save).toHaveBeenCalledWith('r-1', expect.objectContaining({ asaasCustomerId: 'cus_existente', legalName: 'Prime Pizza Ltda' }));
    expect(result.asaasCustomerId).toBe('cus_existente');
  });

  it('persiste todos os campos do input (dados cadastrais podem ser atualizados mesmo reusando o cliente Asaas)', async () => {
    const existing = buildPayer();
    const { service, billingPayerRepository } = setup({ existing });
    const input = buildInput({ email: 'novo-email@primepizza.com', phone: '11988887777', address: buildAddress({ number: '20', complement: 'Sala 2' }) });
    const now = new Date('2026-11-09T12:00:00Z');

    await service.completePayer('r-1', input, now);

    expect(billingPayerRepository.save).toHaveBeenCalledWith('r-1', {
      asaasCustomerId: 'cus_existente',
      legalName: input.legalName,
      document: input.document,
      email: input.email,
      phone: input.phone,
      address: input.address,
      completedAt: now,
    });
  });
});
