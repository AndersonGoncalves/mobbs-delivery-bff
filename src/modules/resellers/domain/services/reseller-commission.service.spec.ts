import { localMidnight } from '../../../platform-billing/domain/billing-calendar';
import type { ISubscriptionObligation } from '../../../platform-billing/domain/entities/subscription-obligation.entity';
import type { IResellerClientRepository } from '../repositories/reseller-client.repository.interface';
import type { IResellerRepository } from '../repositories/reseller.repository.interface';
import type { IResellerCommissionRepository } from '../repositories/reseller-commission.repository.interface';
import type { IReseller } from '../entities/reseller.entity';
import type { IResellerClient } from '../entities/reseller-client.entity';
import type { IResellerCommission } from '../entities/reseller-commission.entity';
import { ResellerCommissionService } from './reseller-commission.service';

function buildObligation(overrides: Partial<ISubscriptionObligation> = {}): ISubscriptionObligation {
  return {
    id: 'ob-1', restaurantId: 'r-1', kind: 'monthly', referenceMonth: '2026-10', tier: 'pro', settingsVersionId: 'v1',
    amountCents: 7990, status: 'paid', dueDate: localMidnight(new Date('2026-11-10T12:00:00Z')),
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

function buildReseller(overrides: Partial<IReseller> = {}): IReseller {
  return { id: 'reseller-1', name: 'Ana', email: 'ana@revenda.com', phone: '11999999999', code: 'ABC123', isActive: true, createdAt: new Date('2026-01-01'), ...overrides };
}

function buildClient(overrides: Partial<IResellerClient> = {}): IResellerClient {
  return { id: 'client-1', resellerId: 'reseller-1', restaurantId: 'r-1', origin: 'link', createdAt: new Date('2026-01-02'), ...overrides };
}

function buildCommission(overrides: Partial<IResellerCommission> = {}): IResellerCommission {
  return {
    id: 'c-1', resellerId: 'reseller-1', restaurantId: 'r-1', subscriptionObligationId: 'ob-1',
    obligationKind: 'monthly', obligationAmountCents: 7990, commissionCents: 7990, status: 'pendente',
    createdAt: new Date('2026-10-05'), ...overrides,
  };
}

function setup(overrides: {
  commission?: Partial<IResellerCommissionRepository>;
  client?: Partial<IResellerClientRepository>;
  reseller?: Partial<IResellerRepository>;
} = {}) {
  const commissionRepository = {
    findByObligationId: jest.fn().mockResolvedValue(null),
    countActiveByRestaurantAndKinds: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation(async (input) => buildCommission(input)),
    markCancelled: jest.fn().mockResolvedValue(buildCommission({ status: 'cancelada' })),
    markObligationRefunded: jest.fn().mockResolvedValue(buildCommission({ status: 'pago', obligationRefundedAt: new Date() })),
    ...overrides.commission,
  } as unknown as IResellerCommissionRepository;
  const resellerClientRepository = {
    findByRestaurantId: jest.fn().mockResolvedValue(buildClient()),
    ...overrides.client,
  } as unknown as IResellerClientRepository;
  const resellerRepository = {
    findById: jest.fn().mockResolvedValue(buildReseller()),
    ...overrides.reseller,
  } as unknown as IResellerRepository;
  const service = new ResellerCommissionService({ commissionRepository, resellerClientRepository, resellerRepository });
  return { service, commissionRepository, resellerClientRepository, resellerRepository };
}

describe('ResellerCommissionService (specs/0205-comissao-revendedor)', () => {
  describe('onObligationPaid', () => {
    // AC-1.
    it('REQ-2: obligation mensal paga gera comissão no valor integral, enquanto houver vaga (< 3)', async () => {
      const { service, commissionRepository } = setup({ commission: { countActiveByRestaurantAndKinds: jest.fn().mockResolvedValue(1) } });

      await service.onObligationPaid(buildObligation({ kind: 'monthly', amountCents: 7990 }));

      expect(commissionRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        resellerId: 'reseller-1', restaurantId: 'r-1', subscriptionObligationId: 'ob-1',
        obligationKind: 'monthly', obligationAmountCents: 7990, commissionCents: 7990,
      }));
    });

    // AC-1.
    it('REQ-3: a partir da 4ª parcela mensal (3 já ativas), nenhuma comissão nova é gerada', async () => {
      const { service, commissionRepository } = setup({ commission: { countActiveByRestaurantAndKinds: jest.fn().mockResolvedValue(3) } });

      await service.onObligationPaid(buildObligation({ kind: 'monthly' }));

      expect(commissionRepository.create).not.toHaveBeenCalled();
    });

    // AC-1 — `monthly-prorated` conta como mensal (resposta a).
    it('REQ-2: monthly-prorated é tratada como mensal pra fins de comissão e de contagem da vaga', async () => {
      const { service, commissionRepository } = setup();

      await service.onObligationPaid(buildObligation({ kind: 'monthly-prorated', amountCents: 3500 }));

      expect(commissionRepository.countActiveByRestaurantAndKinds).toHaveBeenCalledWith('r-1', ['monthly', 'monthly-prorated']);
      expect(commissionRepository.create).toHaveBeenCalledWith(expect.objectContaining({ obligationKind: 'monthly-prorated', commissionCents: 3500 }));
    });

    // AC-2.
    it('REQ-4: adesão anual inicial gera comissão de 1/3 do valor', async () => {
      const { service, commissionRepository } = setup();

      await service.onObligationPaid(buildObligation({ kind: 'annual-initial', amountCents: 90000 }));

      expect(commissionRepository.create).toHaveBeenCalledWith(expect.objectContaining({ obligationKind: 'annual-initial', commissionCents: 30000 }));
    });

    // AC-2 — sem limite de ocorrências, ao contrário do mensal.
    it('REQ-4: renovação anual (ano 2 em diante) também gera comissão de 1/3, sem limite', async () => {
      const { service, commissionRepository } = setup();

      await service.onObligationPaid(buildObligation({ id: 'ob-2', kind: 'annual-renewal', amountCents: 96000 }));

      expect(commissionRepository.create).toHaveBeenCalledWith(expect.objectContaining({ obligationKind: 'annual-renewal', commissionCents: 32000 }));
      expect(commissionRepository.countActiveByRestaurantAndKinds).not.toHaveBeenCalled();
    });

    // AC-3 — regras independentes: migrar pra anual não afeta as comissões mensais já geradas
    // (o service nem olha pra elas na obligation anual, só cria a sua própria).
    it('REQ-5: obligation anual gera sua própria comissão independente de quantas mensais já existem', async () => {
      const { service, commissionRepository } = setup({ commission: { countActiveByRestaurantAndKinds: jest.fn().mockResolvedValue(2) } });

      await service.onObligationPaid(buildObligation({ id: 'ob-3', kind: 'annual-initial', amountCents: 90000 }));

      expect(commissionRepository.create).toHaveBeenCalledWith(expect.objectContaining({ obligationKind: 'annual-initial', commissionCents: 30000 }));
    });

    // AC-4.
    it('REQ-6: restaurante sem ResellerClient não gera comissão', async () => {
      const { service, commissionRepository } = setup({ client: { findByRestaurantId: jest.fn().mockResolvedValue(null) } });

      await service.onObligationPaid(buildObligation());

      expect(commissionRepository.create).not.toHaveBeenCalled();
    });

    // AC-4.
    it('REQ-6: revendedor inativo não gera comissão', async () => {
      const { service, commissionRepository } = setup({ reseller: { findById: jest.fn().mockResolvedValue(buildReseller({ isActive: false })) } });

      await service.onObligationPaid(buildObligation());

      expect(commissionRepository.create).not.toHaveBeenCalled();
    });

    // AC-5.
    it('REQ-7: obligation já processada (comissão existente) não gera uma segunda', async () => {
      const { service, commissionRepository } = setup({ commission: { findByObligationId: jest.fn().mockResolvedValue(buildCommission()) } });

      await service.onObligationPaid(buildObligation());

      expect(commissionRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('onObligationRefunded', () => {
    // AC-6.
    it('REQ-8: comissão pendente é cancelada quando a obligation de origem é estornada', async () => {
      const { service, commissionRepository } = setup({ commission: { findByObligationId: jest.fn().mockResolvedValue(buildCommission({ status: 'pendente' })) } });

      await service.onObligationRefunded(buildObligation({ status: 'refunded' }));

      expect(commissionRepository.markCancelled).toHaveBeenCalledWith('c-1', expect.any(Date));
    });

    // AC-6.
    it('REQ-9: comissão já paga nunca é cancelada/cobrada de volta, só registra a data do estorno', async () => {
      const { service, commissionRepository } = setup({
        commission: { findByObligationId: jest.fn().mockResolvedValue(buildCommission({ status: 'pago', paidAt: new Date('2026-10-10') })) },
      });

      await service.onObligationRefunded(buildObligation({ status: 'refunded' }));

      expect(commissionRepository.markCancelled).not.toHaveBeenCalled();
      expect(commissionRepository.markObligationRefunded).toHaveBeenCalledWith('c-1', expect.any(Date));
    });

    it('obligation sem comissão gerada (ex. 4ª parcela mensal) não faz nada ao ser estornada', async () => {
      const { service, commissionRepository } = setup({ commission: { findByObligationId: jest.fn().mockResolvedValue(null) } });

      await service.onObligationRefunded(buildObligation({ status: 'refunded' }));

      expect(commissionRepository.markCancelled).not.toHaveBeenCalled();
      expect(commissionRepository.markObligationRefunded).not.toHaveBeenCalled();
    });
  });
});
