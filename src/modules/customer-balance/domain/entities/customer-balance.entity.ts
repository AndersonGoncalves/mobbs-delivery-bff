/**
 * docs/architecture/data-model.md — specs/0131-cashback-app + specs/0132-programa-fidelidade-app.
 * Um documento por par `customerId`+`restaurantId` (isolamento multi-tenant, nunca somado nem
 * transferido entre restaurantes — "Fora de escopo" das duas specs). `loyaltyStampCount` mora
 * aqui (não numa entidade separada) porque toda operação de fidelidade precisa da mesma trava de
 * concorrência que o saldo em si (`specs/0131/plan.md`, "Contador de selos").
 */
export interface ICustomerBalance {
  id: string;
  customerId: string;
  restaurantId: string;
  /** Reais decimais, nunca negativo — mesma convenção de `Order.subtotal`/`discount`/`total`. */
  balance: number;
  loyaltyStampCount: number;
  updatedAt: string;
}

/**
 * Ledger append-only (nunca editado/apagado) — histórico de créditos/débitos do saldo acima,
 * usado pro histórico simples exigido por REQ-8 (0131)/REQ-6 (0132). Um saldo único por par (não
 * um campo por origem); a distinção entre cashback e fidelidade existe só aqui, em `source`.
 */
export type CustomerBalanceTransactionSource = 'cashback_credit' | 'loyalty_reward_credit' | 'redemption_debit' | 'redemption_refund';

export interface ICustomerBalanceTransaction {
  id: string;
  customerId: string;
  restaurantId: string;
  source: CustomerBalanceTransactionSource;
  /** Sempre positivo — o sinal (crédito/débito) vem de `source`, não do valor. */
  amount: number;
  /** Rastreabilidade — qual pedido gerou/consumiu esta transação. */
  orderId?: string;
  createdAt: string;
}
