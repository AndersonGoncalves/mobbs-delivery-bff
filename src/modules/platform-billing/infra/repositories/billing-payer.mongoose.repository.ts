import type { IBillingPayer } from '../../domain/entities/billing-payer.entity';
import type { IBillingPayerRepository } from '../../domain/repositories/billing-payer.repository.interface';
import { BillingPayerModel } from '../models/billing-payer.mongoose.model';

interface BillingPayerLeanDocument {
  _id: string;
  restaurantId: string;
  asaasCustomerId: string;
  legalName: string;
  document: string;
  email: string;
  phone: string;
  address: IBillingPayer['address'];
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

function toEntity(doc: BillingPayerLeanDocument): IBillingPayer {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    asaasCustomerId: doc.asaasCustomerId,
    legalName: doc.legalName,
    document: doc.document,
    email: doc.email,
    phone: doc.phone,
    address: doc.address,
    completedAt: doc.completedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class BillingPayerMongooseRepository implements IBillingPayerRepository {
  async findByRestaurantId(restaurantId: string): Promise<IBillingPayer | null> {
    const doc = await BillingPayerModel.findOne({ restaurantId }).lean<BillingPayerLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async save(restaurantId: string, data: Omit<IBillingPayer, 'id' | 'restaurantId' | 'createdAt' | 'updatedAt'>): Promise<IBillingPayer> {
    const doc = await BillingPayerModel.findOneAndUpdate(
      { restaurantId },
      { $set: { ...data, restaurantId } },
      { upsert: true, new: true },
    ).lean<BillingPayerLeanDocument>();
    return toEntity(doc as BillingPayerLeanDocument);
  }
}
