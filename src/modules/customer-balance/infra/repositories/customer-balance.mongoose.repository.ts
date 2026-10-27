import { CustomerBalanceTransactionSource, ICustomerBalance, ICustomerBalanceTransaction } from '../../domain/entities/customer-balance.entity';
import {
  ICustomerBalanceRepository,
  NewCustomerBalanceTransactionInput,
} from '../../domain/repositories/customer-balance.repository.interface';
import { CustomerBalanceModel } from '../models/customer-balance.mongoose.model';
import { CustomerBalanceTransactionModel } from '../models/customer-balance-transaction.mongoose.model';

interface CustomerBalanceLeanDocument {
  _id: string;
  customerId: string;
  restaurantId: string;
  balance: number;
  loyaltyStampCount: number;
  updatedAt: Date;
}

interface CustomerBalanceTransactionLeanDocument {
  _id: string;
  customerId: string;
  restaurantId: string;
  source: CustomerBalanceTransactionSource;
  amount: number;
  orderId?: string;
  createdAt: Date;
}

function toEntity(doc: CustomerBalanceLeanDocument): ICustomerBalance {
  return {
    id: doc._id,
    customerId: doc.customerId,
    restaurantId: doc.restaurantId,
    balance: doc.balance,
    loyaltyStampCount: doc.loyaltyStampCount,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toTransactionEntity(doc: CustomerBalanceTransactionLeanDocument): ICustomerBalanceTransaction {
  return {
    id: doc._id,
    customerId: doc.customerId,
    restaurantId: doc.restaurantId,
    source: doc.source,
    amount: doc.amount,
    orderId: doc.orderId,
    createdAt: doc.createdAt.toISOString(),
  };
}

export class CustomerBalanceMongooseRepository implements ICustomerBalanceRepository {
  async getOrCreate(customerId: string, restaurantId: string): Promise<ICustomerBalance> {
    const doc = await CustomerBalanceModel.findOneAndUpdate(
      { customerId, restaurantId },
      { $setOnInsert: { customerId, restaurantId, balance: 0, loyaltyStampCount: 0 } },
      { new: true, upsert: true },
    ).lean<CustomerBalanceLeanDocument>();
    return toEntity(doc as CustomerBalanceLeanDocument);
  }

  async incrementBalance(customerId: string, restaurantId: string, amount: number): Promise<ICustomerBalance> {
    const doc = await CustomerBalanceModel.findOneAndUpdate(
      { customerId, restaurantId },
      { $inc: { balance: amount }, $setOnInsert: { loyaltyStampCount: 0 } },
      { new: true, upsert: true },
    ).lean<CustomerBalanceLeanDocument>();
    return toEntity(doc as CustomerBalanceLeanDocument);
  }

  /**
   * Compare-and-swap: só debita quando `balance >= amount` no momento exato da escrita — mesmo
   * padrão de `CouponMongooseRepository.incrementUsageIfWithinLimit` (specs/0022 REQ-4). Nunca
   * faz upsert (um débito nunca cria um saldo do zero) — `null` se o documento não existir ainda.
   */
  async tryDebit(customerId: string, restaurantId: string, amount: number): Promise<ICustomerBalance | null> {
    const doc = await CustomerBalanceModel.findOneAndUpdate(
      { customerId, restaurantId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true },
    ).lean<CustomerBalanceLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async incrementLoyaltyStamp(customerId: string, restaurantId: string): Promise<ICustomerBalance> {
    const doc = await CustomerBalanceModel.findOneAndUpdate(
      { customerId, restaurantId },
      { $inc: { loyaltyStampCount: 1 }, $setOnInsert: { balance: 0 } },
      { new: true, upsert: true },
    ).lean<CustomerBalanceLeanDocument>();
    return toEntity(doc as CustomerBalanceLeanDocument);
  }

  async resetLoyaltyStamp(customerId: string, restaurantId: string): Promise<ICustomerBalance> {
    const doc = await CustomerBalanceModel.findOneAndUpdate(
      { customerId, restaurantId },
      { $set: { loyaltyStampCount: 0 }, $setOnInsert: { balance: 0 } },
      { new: true, upsert: true },
    ).lean<CustomerBalanceLeanDocument>();
    return toEntity(doc as CustomerBalanceLeanDocument);
  }

  async addTransaction(input: NewCustomerBalanceTransactionInput): Promise<ICustomerBalanceTransaction> {
    const doc = await CustomerBalanceTransactionModel.create(input);
    return toTransactionEntity(doc.toObject() as CustomerBalanceTransactionLeanDocument);
  }

  async getHistory(customerId: string, restaurantId: string): Promise<ICustomerBalanceTransaction[]> {
    const docs = await CustomerBalanceTransactionModel.find({ customerId, restaurantId })
      .sort({ createdAt: -1 })
      .lean<CustomerBalanceTransactionLeanDocument[]>();
    return docs.map(toTransactionEntity);
  }
}
