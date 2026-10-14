import { IBlockedCustomer } from '../../domain/entities/blocked-customer.entity';
import { IBlockedCustomerRepository } from '../../domain/repositories/blocked-customer.repository.interface';
import { BlockedCustomerModel } from '../models/blocked-customer.mongoose.model';

interface BlockedCustomerLeanDocument {
  _id: string;
  restaurantId: string;
  phone: string;
  customerName?: string;
  createdAt: Date;
}

function toDomain(doc: BlockedCustomerLeanDocument): IBlockedCustomer {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    phone: doc.phone,
    customerName: doc.customerName,
    createdAt: doc.createdAt.toISOString(),
  };
}

export class BlockedCustomerMongooseRepository implements IBlockedCustomerRepository {
  async listByRestaurant(restaurantId: string): Promise<IBlockedCustomer[]> {
    const docs = await BlockedCustomerModel.find({ restaurantId }).sort({ createdAt: -1 }).lean<BlockedCustomerLeanDocument[]>();
    return docs.map(toDomain);
  }

  async block(restaurantId: string, phone: string, customerName?: string): Promise<IBlockedCustomer> {
    const doc = await BlockedCustomerModel.findOneAndUpdate(
      { restaurantId, phone },
      { $setOnInsert: { restaurantId, phone, customerName } },
      { new: true, upsert: true },
    ).lean<BlockedCustomerLeanDocument>();
    return toDomain(doc!);
  }

  async unblock(id: string, restaurantId: string): Promise<boolean> {
    const result = await BlockedCustomerModel.deleteOne({ _id: id, restaurantId });
    return result.deletedCount > 0;
  }

  async isBlocked(restaurantId: string, phone: string): Promise<boolean> {
    const doc = await BlockedCustomerModel.findOne({ restaurantId, phone }).lean();
    return doc !== null;
  }
}
