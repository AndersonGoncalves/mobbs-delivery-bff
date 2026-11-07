import { IResellerCommission, ResellerCommissionObligationKind } from '../entities/reseller-commission.entity';

export interface IResellerCommissionRepository {
  create(input: {
    resellerId: string;
    restaurantId: string;
    subscriptionObligationId: string;
    obligationKind: ResellerCommissionObligationKind;
    obligationAmountCents: number;
    commissionCents: number;
  }): Promise<IResellerCommission>;

  findById(id: string): Promise<IResellerCommission | null>;

  /** Idempotência (REQ-7) — nunca gera uma segunda comissão pra mesma obligation. */
  findByObligationId(subscriptionObligationId: string): Promise<IResellerCommission | null>;

  /** REQ-2/REQ-3 — conta comissões não-canceladas (`pendente` + `pago`) daqueles tipos pra aquele
   * restaurante, pra decidir se ainda sobra vaga dentro do limite de 3 parcelas mensais (plan.md
   * decisão 1 — `cancelada` nunca conta, a vaga reabre). */
  countActiveByRestaurantAndKinds(restaurantId: string, kinds: ResellerCommissionObligationKind[]): Promise<number>;

  /** REQ-12/REQ-13 — todas as comissões de um revendedor, mais recentes primeiro. */
  listByReseller(resellerId: string): Promise<IResellerCommission[]>;

  /** REQ-11 — só marca se ainda `pendente` (mesmo padrão idempotente de `IReferralRepository.markPaid`); retorna
   * `null` se não havia nenhuma `pendente` com esse id (já paga ou cancelada — o chamador decide o que fazer). */
  markPaid(id: string, paidAt: Date): Promise<IResellerCommission | null>;

  /** REQ-8 — só marca se ainda `pendente`. */
  markCancelled(id: string, cancelledAt: Date): Promise<IResellerCommission | null>;

  /** REQ-9 — só grava a data de estorno, nunca muda o status (chamado só quando já está `pago`). */
  markObligationRefunded(id: string, obligationRefundedAt: Date): Promise<IResellerCommission | null>;
}
