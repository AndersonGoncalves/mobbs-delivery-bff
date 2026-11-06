/** specs/0205-comissao-revendedor — tipo da `SubscriptionObligation` (`modules/platform-billing`)
 * que gerou a comissão; carregado aqui só pra exibição, nunca recalculado a partir dele. */
export type ResellerCommissionObligationKind = 'monthly' | 'monthly-prorated' | 'annual-initial' | 'annual-renewal';

export type ResellerCommissionStatus = 'pendente' | 'pago' | 'cancelada';

/**
 * Uma comissão gerada quando uma `SubscriptionObligation` de um cliente efetivado
 * (`IResellerClient`) é paga — nunca mais de uma por obligation (índice único em
 * `subscriptionObligationId`, plan.md). `commissionCents` já é o valor devido ao revendedor
 * (100% da obligation se mensal/mensal-proporcional, 1/3 se anual — regra fixa, calculada uma
 * única vez na criação, nunca recalculada depois).
 */
export interface IResellerCommission {
  id: string;
  resellerId: string;
  restaurantId: string;
  subscriptionObligationId: string;
  obligationKind: ResellerCommissionObligationKind;
  obligationAmountCents: number;
  commissionCents: number;
  status: ResellerCommissionStatus;
  createdAt: Date;
  /** Pago manualmente (Pix por fora) pelo administrador — REQ-11. */
  paidAt?: Date;
  /** Cancelada por estorno da obligation de origem, enquanto ainda `pendente` — REQ-8. */
  cancelledAt?: Date;
  /** REQ-9 — a obligation foi estornada DEPOIS de a comissão já estar `pago`; nunca reverte o
   * pagamento, só registra a data pra auditoria/visibilidade do administrador. */
  obligationRefundedAt?: Date;
}
