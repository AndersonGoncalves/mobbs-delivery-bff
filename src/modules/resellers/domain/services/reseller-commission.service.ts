import type { ISubscriptionObligation } from '../../../platform-billing/domain/entities/subscription-obligation.entity';
import type { IResellerClientRepository } from '../repositories/reseller-client.repository.interface';
import type { IResellerRepository } from '../repositories/reseller.repository.interface';
import type { IResellerCommissionRepository } from '../repositories/reseller-commission.repository.interface';
import type { ResellerCommissionObligationKind } from '../entities/reseller-commission.entity';

const MONTHLY_KINDS: ResellerCommissionObligationKind[] = ['monthly', 'monthly-prorated'];
const ANNUAL_KINDS: ResellerCommissionObligationKind[] = ['annual-initial', 'annual-renewal'];
const MAX_MONTHLY_COMMISSIONS = 3;

/**
 * specs/0205-comissao-revendedor — calcula e gera a comissão do revendedor quando uma
 * `SubscriptionObligation` (`platform-billing`) é paga, e desfaz (sem cobrar de volta) quando uma
 * já gerada é estornada depois. Única peça de lógica de domínio não-trivial do módulo
 * `resellers` (o resto é controller→repositório direto) — chamada tanto pelo observer do fluxo de
 * pagamento (`ResellerCommissionObligationObserver`) quanto, indiretamente, pelos controllers
 * (`markPaid`, ação do administrador).
 */
export class ResellerCommissionService {
  constructor(
    private readonly deps: {
      commissionRepository: IResellerCommissionRepository;
      resellerClientRepository: IResellerClientRepository;
      resellerRepository: IResellerRepository;
    },
  ) {}

  /** REQ-2 a REQ-7. */
  async onObligationPaid(obligation: ISubscriptionObligation): Promise<void> {
    // REQ-7 — idempotência: reprocessamento (reconciliação manual, retry) nunca duplica.
    if (await this.deps.commissionRepository.findByObligationId(obligation.id)) return;

    const client = await this.deps.resellerClientRepository.findByRestaurantId(obligation.restaurantId);
    if (!client) return; // REQ-6 — restaurante sem revendedor vinculado.

    const reseller = await this.deps.resellerRepository.findById(client.resellerId);
    if (!reseller || !reseller.isActive) return; // REQ-6 — revendedor inativo não acumula novas comissões.

    if (MONTHLY_KINDS.includes(obligation.kind as ResellerCommissionObligationKind)) {
      // plan.md decisão 1 — só conta comissões não-canceladas; uma cancelada reabre a vaga.
      const activeCount = await this.deps.commissionRepository.countActiveByRestaurantAndKinds(obligation.restaurantId, MONTHLY_KINDS);
      if (activeCount >= MAX_MONTHLY_COMMISSIONS) return; // REQ-3.

      await this.deps.commissionRepository.create({
        resellerId: reseller.id,
        restaurantId: obligation.restaurantId,
        subscriptionObligationId: obligation.id,
        obligationKind: obligation.kind as ResellerCommissionObligationKind,
        obligationAmountCents: obligation.amountCents,
        commissionCents: obligation.amountCents, // REQ-2 — valor integral.
      });
      return;
    }

    if (ANNUAL_KINDS.includes(obligation.kind as ResellerCommissionObligationKind)) {
      await this.deps.commissionRepository.create({
        resellerId: reseller.id,
        restaurantId: obligation.restaurantId,
        subscriptionObligationId: obligation.id,
        obligationKind: obligation.kind as ResellerCommissionObligationKind,
        obligationAmountCents: obligation.amountCents,
        commissionCents: Math.round(obligation.amountCents / 3), // REQ-4 — sem limite de ocorrências.
      });
    }
    // Qualquer outro `kind` (não existe hoje, mas por segurança) não gera comissão.
  }

  /** REQ-8/REQ-9. */
  async onObligationRefunded(obligation: ISubscriptionObligation): Promise<void> {
    const commission = await this.deps.commissionRepository.findByObligationId(obligation.id);
    if (!commission) return; // nunca gerou comissão (ex.: 4ª parcela mensal) — nada a fazer.

    if (commission.status === 'pendente') {
      await this.deps.commissionRepository.markCancelled(commission.id, new Date());
      return;
    }
    if (commission.status === 'pago') {
      // REQ-9 — nunca cobra de volta; só audita.
      await this.deps.commissionRepository.markObligationRefunded(commission.id, new Date());
    }
  }
}
