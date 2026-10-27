import { ICustomerBalance, ICustomerBalanceTransaction } from '../entities/customer-balance.entity';
import { ICustomerBalanceRepository } from '../repositories/customer-balance.repository.interface';

/** Arredonda pra 2 casas decimais evitando erro de ponto flutuante (ex. `0.1 + 0.2`). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * specs/0131-cashback-app + specs/0132-programa-fidelidade-app (`plan.md`, "Modelo de dados") —
 * ponto único de regra de negócio do saldo resgatável compartilhado pelas duas specs. Chamado só
 * por `OrdersController` (criação, cancelamento, entrega) e pelas rotas de leitura
 * (`CustomerBalanceController`/`CustomersSummaryController`).
 */
export class CustomerBalanceService {
  constructor(private readonly repository: ICustomerBalanceRepository) {}

  async getOrCreate(customerId: string, restaurantId: string): Promise<ICustomerBalance> {
    return this.repository.getOrCreate(customerId, restaurantId);
  }

  /** REQ-2 (0131) — crédito sobre o total pago (já líquido de cashback resgatado no mesmo pedido). */
  async creditCashback(customerId: string, restaurantId: string, amount: number, orderId: string): Promise<void> {
    const rounded = round2(amount);
    if (rounded <= 0) return;
    await this.repository.incrementBalance(customerId, restaurantId, rounded);
    await this.repository.addTransaction({ customerId, restaurantId, source: 'cashback_credit', amount: rounded, orderId });
  }

  /** specs/0132-programa-fidelidade-app REQ-3 — recompensa de valor fixo ao completar a meta. */
  async creditLoyaltyReward(customerId: string, restaurantId: string, amount: number, orderId: string): Promise<void> {
    const rounded = round2(amount);
    if (rounded <= 0) return;
    await this.repository.incrementBalance(customerId, restaurantId, rounded);
    await this.repository.addTransaction({ customerId, restaurantId, source: 'loyalty_reward_credit', amount: rounded, orderId });
  }

  /** specs/0132-programa-fidelidade-app REQ-2 — devolve o novo contador. */
  async incrementLoyaltyStamp(customerId: string, restaurantId: string): Promise<number> {
    const updated = await this.repository.incrementLoyaltyStamp(customerId, restaurantId);
    return updated.loyaltyStampCount;
  }

  /** specs/0132-programa-fidelidade-app REQ-3 — zera de volta a 0 ao creditar a recompensa. */
  async resetLoyaltyStamp(customerId: string, restaurantId: string): Promise<void> {
    await this.repository.resetLoyaltyStamp(customerId, restaurantId);
  }

  /**
   * REQ-4/REQ-5/REQ-7 (0131) — resgate no checkout. Nunca confia no valor pedido pelo app: capa
   * em `min(saldo atual, valor pedido, total do pedido antes do cashback)` e debita de forma
   * atômica (`tryDebit`, compare-and-swap, mesmo padrão de
   * `CouponMongooseRepository.incrementUsageIfWithinLimit`). Sob concorrência (dois resgates do
   * mesmo cliente/restaurante ao mesmo tempo), tenta de novo com o saldo mais recente até 3 vezes
   * — nunca deixa o saldo ficar negativo. Devolve o valor efetivamente aplicado (`0` se nada pôde
   * ser debitado).
   */
  async debitRedemption(
    customerId: string,
    restaurantId: string,
    requestedAmount: number,
    orderTotalBeforeCashback: number,
    orderId: string,
  ): Promise<number> {
    const cap = round2(Math.min(requestedAmount, orderTotalBeforeCashback));
    if (cap <= 0) return 0;

    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await this.repository.getOrCreate(customerId, restaurantId);
      const applied = round2(Math.min(current.balance, cap));
      if (applied <= 0) return 0;

      const updated = await this.repository.tryDebit(customerId, restaurantId, applied);
      if (updated) {
        await this.repository.addTransaction({ customerId, restaurantId, source: 'redemption_debit', amount: applied, orderId });
        return applied;
      }
      // Perdeu a corrida (saldo mudou entre a leitura e a escrita) — tenta de novo com o saldo atual.
    }
    return 0;
  }

  /** REQ-6 (0131) — devolve ao saldo o valor resgatado num pedido cancelado antes de entregar. */
  async refundRedemption(customerId: string, restaurantId: string, amount: number, orderId: string): Promise<void> {
    const rounded = round2(amount);
    if (rounded <= 0) return;
    await this.repository.incrementBalance(customerId, restaurantId, rounded);
    await this.repository.addTransaction({ customerId, restaurantId, source: 'redemption_refund', amount: rounded, orderId });
  }

  /** REQ-8 (0131) / REQ-6 (0132). */
  async getHistory(customerId: string, restaurantId: string): Promise<ICustomerBalanceTransaction[]> {
    return this.repository.getHistory(customerId, restaurantId);
  }
}
