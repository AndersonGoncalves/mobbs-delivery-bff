import { IReferral, ReferralStatus } from '../../domain/entities/referral.entity';
import { IReferralRepository } from '../../domain/repositories/referral.repository.interface';
import { ReferralModel } from '../models/referral.mongoose.model';

interface ReferralLeanDocument {
  _id: string;
  referrerCustomerId: string;
  referredRestaurantId: string;
  rewardCents: number;
  status: ReferralStatus;
  createdAt: Date;
  paidAt?: Date;
}

function toEntity(doc: ReferralLeanDocument): IReferral {
  return {
    id: doc._id,
    referrerCustomerId: doc.referrerCustomerId,
    referredRestaurantId: doc.referredRestaurantId,
    rewardCents: doc.rewardCents,
    status: doc.status,
    createdAt: doc.createdAt,
    paidAt: doc.paidAt,
  };
}

export class ReferralMongooseRepository implements IReferralRepository {
  async create(input: { referrerCustomerId: string; referredRestaurantId: string; rewardCents: number }): Promise<IReferral> {
    const doc = await ReferralModel.create({ ...input, status: 'pendente' });
    return toEntity(doc.toObject());
  }

  async findByReferrerCustomerId(customerId: string): Promise<IReferral[]> {
    const docs = await ReferralModel.find({ referrerCustomerId: customerId }).sort({ createdAt: -1 }).lean<ReferralLeanDocument[]>();
    return docs.map(toEntity);
  }

  async getPendingBalanceCents(customerId: string): Promise<number> {
    const [result] = await ReferralModel.aggregate<{ total: number }>([
      { $match: { referrerCustomerId: customerId, status: 'pendente' } },
      { $group: { _id: null, total: { $sum: '$rewardCents' } } },
    ]);
    return result?.total ?? 0;
  }

  async listAll(filter: { status?: ReferralStatus }): Promise<IReferral[]> {
    const query = filter.status
      ? { referrerCustomerId: { $exists: true }, status: filter.status }
      : { referrerCustomerId: { $exists: true } };
    const docs = await ReferralModel.find(query).sort({ createdAt: -1 }).lean<ReferralLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findById(id: string): Promise<IReferral | null> {
    const doc = await ReferralModel.findById(id).lean<ReferralLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async markPaid(id: string, paidAt: Date): Promise<IReferral | null> {
    // Só marca quando ainda está pendente: repetir o pedido não muda a data original (REQ-7).
    const doc = await ReferralModel.findOneAndUpdate(
      { _id: id, status: 'pendente' },
      { $set: { status: 'pago', paidAt } },
      { new: true },
    ).lean<ReferralLeanDocument>();
    if (doc) return toEntity(doc);
    return this.findById(id);
  }
}
