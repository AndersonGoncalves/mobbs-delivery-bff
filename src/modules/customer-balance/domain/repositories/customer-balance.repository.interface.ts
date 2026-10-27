import { ICustomerBalance, ICustomerBalanceTransaction, CustomerBalanceTransactionSource } from '../entities/customer-balance.entity';

export interface NewCustomerBalanceTransactionInput {
  customerId: string;
  restaurantId: string;
  source: CustomerBalanceTransactionSource;
  amount: number;
  orderId?: string;
}

export interface ICustomerBalanceRepository {
  /** Upsert — devolve o documento existente, ou cria um novo com `balance`/`loyaltyStampCount` zerados. */
  getOrCreate(customerId: string, restaurantId: string): Promise<ICustomerBalance>;

  /** `$inc` atômico (soma pode ser positiva ou negativa), upsert. */
  incrementBalance(customerId: string, restaurantId: string, amount: number): Promise<ICustomerBalance>;

  /**
   * Compare-and-swap: só debita quando `balance >= amount` (nunca deixa negativo sob
   * concorrência, mesmo padrão de `CouponMongooseRepository.incrementUsageIfWithinLimit`).
   * Devolve `null` quando o saldo não é suficiente no momento exato da escrita (quem chama decide
   * se tenta de novo com um valor mais baixo).
   */
  tryDebit(customerId: string, restaurantId: string, amount: number): Promise<ICustomerBalance | null>;

  incrementLoyaltyStamp(customerId: string, restaurantId: string): Promise<ICustomerBalance>;

  resetLoyaltyStamp(customerId: string, restaurantId: string): Promise<ICustomerBalance>;

  addTransaction(input: NewCustomerBalanceTransactionInput): Promise<ICustomerBalanceTransaction>;

  /** Mais recente primeiro — REQ-8 (0131)/REQ-6 (0132). */
  getHistory(customerId: string, restaurantId: string): Promise<ICustomerBalanceTransaction[]>;
}
