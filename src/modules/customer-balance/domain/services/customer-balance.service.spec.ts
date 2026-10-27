import { ICustomerBalance, ICustomerBalanceTransaction } from '../entities/customer-balance.entity';
import { ICustomerBalanceRepository, NewCustomerBalanceTransactionInput } from '../repositories/customer-balance.repository.interface';
import { CustomerBalanceService } from './customer-balance.service';

const CUSTOMER_ID = 'c-1';
const RESTAURANT_ID = 'r-1';

/** Fake em memória com o mesmo comportamento atômico do Mongoose real (`tryDebit` é compare-and-swap). */
function buildFakeRepository(initial: Partial<ICustomerBalance> = {}): ICustomerBalanceRepository {
  let balance = initial.balance ?? 0;
  let loyaltyStampCount = initial.loyaltyStampCount ?? 0;
  const transactions: ICustomerBalanceTransaction[] = [];

  const snapshot = (): ICustomerBalance => ({
    id: 'cb-1',
    customerId: CUSTOMER_ID,
    restaurantId: RESTAURANT_ID,
    balance,
    loyaltyStampCount,
    updatedAt: new Date().toISOString(),
  });

  return {
    getOrCreate: jest.fn().mockImplementation(async () => snapshot()),
    incrementBalance: jest.fn().mockImplementation(async (_c: string, _r: string, amount: number) => {
      balance += amount;
      return snapshot();
    }),
    tryDebit: jest.fn().mockImplementation(async (_c: string, _r: string, amount: number) => {
      if (balance < amount) return null;
      balance -= amount;
      return snapshot();
    }),
    incrementLoyaltyStamp: jest.fn().mockImplementation(async () => {
      loyaltyStampCount += 1;
      return snapshot();
    }),
    resetLoyaltyStamp: jest.fn().mockImplementation(async () => {
      loyaltyStampCount = 0;
      return snapshot();
    }),
    addTransaction: jest.fn().mockImplementation(async (input: NewCustomerBalanceTransactionInput) => {
      const transaction: ICustomerBalanceTransaction = { id: `t-${transactions.length + 1}`, createdAt: new Date().toISOString(), ...input };
      transactions.push(transaction);
      return transaction;
    }),
    getHistory: jest.fn().mockImplementation(async () => [...transactions].reverse()),
  };
}

describe('CustomerBalanceService (specs/0131-cashback-app + specs/0132-programa-fidelidade-app)', () => {
  it('AC-2: credita cashback e grava a transação correspondente', async () => {
    const repository = buildFakeRepository();
    const service = new CustomerBalanceService(repository);

    await service.creditCashback(CUSTOMER_ID, RESTAURANT_ID, 5, 'o-1');

    const balance = await service.getOrCreate(CUSTOMER_ID, RESTAURANT_ID);
    expect(balance.balance).toBe(5);
    const history = await service.getHistory(CUSTOMER_ID, RESTAURANT_ID);
    expect(history).toEqual([expect.objectContaining({ source: 'cashback_credit', amount: 5, orderId: 'o-1' })]);
  });

  it('AC-4: resgate debita exatamente o valor pedido quando o saldo e o total do pedido comportam', async () => {
    const repository = buildFakeRepository({ balance: 5 });
    const service = new CustomerBalanceService(repository);

    const applied = await service.debitRedemption(CUSTOMER_ID, RESTAURANT_ID, 5, 50, 'o-2');

    expect(applied).toBe(5);
    const balance = await service.getOrCreate(CUSTOMER_ID, RESTAURANT_ID);
    expect(balance.balance).toBe(0);
  });

  it('AC-6: resgate nunca deixa o total negativo — capa em min(saldo, valor pedido, total do pedido)', async () => {
    const repository = buildFakeRepository({ balance: 20 });
    const service = new CustomerBalanceService(repository);

    const applied = await service.debitRedemption(CUSTOMER_ID, RESTAURANT_ID, 20, 10, 'o-3');

    expect(applied).toBe(10);
    const balance = await service.getOrCreate(CUSTOMER_ID, RESTAURANT_ID);
    expect(balance.balance).toBe(10);
  });

  it('nunca debita mais do que o saldo disponível, mesmo pedindo mais do que existe', async () => {
    const repository = buildFakeRepository({ balance: 3 });
    const service = new CustomerBalanceService(repository);

    const applied = await service.debitRedemption(CUSTOMER_ID, RESTAURANT_ID, 100, 100, 'o-4');

    expect(applied).toBe(3);
  });

  it('AC-5: devolve ao saldo o valor resgatado num pedido cancelado', async () => {
    const repository = buildFakeRepository({ balance: 0 });
    const service = new CustomerBalanceService(repository);

    await service.refundRedemption(CUSTOMER_ID, RESTAURANT_ID, 5, 'o-5');

    const balance = await service.getOrCreate(CUSTOMER_ID, RESTAURANT_ID);
    expect(balance.balance).toBe(5);
  });

  it('AC-3 (specs/0132): atinge a meta credita a recompensa e zera o contador na mesma passagem', async () => {
    const repository = buildFakeRepository({ loyaltyStampCount: 9 });
    const service = new CustomerBalanceService(repository);

    const count = await service.incrementLoyaltyStamp(CUSTOMER_ID, RESTAURANT_ID);
    expect(count).toBe(10);
    if (count >= 10) {
      await service.creditLoyaltyReward(CUSTOMER_ID, RESTAURANT_ID, 15, 'o-6');
      await service.resetLoyaltyStamp(CUSTOMER_ID, RESTAURANT_ID);
    }

    const balance = await service.getOrCreate(CUSTOMER_ID, RESTAURANT_ID);
    expect(balance.balance).toBe(15);
    expect(balance.loyaltyStampCount).toBe(0);
  });

  it('debitRedemption não debita nada quando o resgate pedido é zero/negativo', async () => {
    const repository = buildFakeRepository({ balance: 10 });
    const service = new CustomerBalanceService(repository);

    expect(await service.debitRedemption(CUSTOMER_ID, RESTAURANT_ID, 0, 50, 'o-7')).toBe(0);
    const balance = await service.getOrCreate(CUSTOMER_ID, RESTAURANT_ID);
    expect(balance.balance).toBe(10);
  });
});
