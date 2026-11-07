import { IResellerCommission, ResellerCommissionObligationKind, ResellerCommissionStatus } from '../../domain/entities/reseller-commission.entity';
import { IResellerCommissionRepository } from '../../domain/repositories/reseller-commission.repository.interface';
import { ResellerCommissionModel } from '../models/reseller-commission.mongoose.model';

interface ResellerCommissionLeanDocument {
  _id: string;
  resellerId: string;
  restaurantId: string;
  subscriptionObligationId: string;
  obligationKind: ResellerCommissionObligationKind;
  obligationAmountCents: number;
  commissionCents: number;
  status: ResellerCommissionStatus;
  createdAt: Date;
  paidAt?: Date;
  cancelledAt?: Date;
  obligationRefundedAt?: Date;
}

function toEntity(doc: ResellerCommissionLeanDocument): IResellerCommission {
  return {
    id: doc._id,
    resellerId: doc.resellerId,
    restaurantId: doc.restaurantId,
    subscriptionObligationId: doc.subscriptionObligationId,
    obligationKind: doc.obligationKind,
    obligationAmountCents: doc.obligationAmountCents,
    commissionCents: doc.commissionCents,
    status: doc.status,
    createdAt: doc.createdAt,
    paidAt: doc.paidAt,
    cancelledAt: doc.cancelledAt,
    obligationRefundedAt: doc.obligationRefundedAt,
  };
}

export class ResellerCommissionMongooseRepository implements IResellerCommissionRepository {
  async create(input: {
    resellerId: string;
    restaurantId: string;
    subscriptionObligationId: string;
    obligationKind: ResellerCommissionObligationKind;
    obligationAmountCents: number;
    commissionCents: number;
  }): Promise<IResellerCommission> {
    const doc = await ResellerCommissionModel.create(input);
    return toEntity(doc.toObject());
  }

  async findById(id: string): Promise<IResellerCommission | null> {
    const doc = await ResellerCommissionModel.findById(id).lean<ResellerCommissionLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findByObligationId(subscriptionObligationId: string): Promise<IResellerCommission | null> {
    const doc = await ResellerCommissionModel.findOne({ subscriptionObligationId }).lean<ResellerCommissionLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async countActiveByRestaurantAndKinds(restaurantId: string, kinds: ResellerCommissionObligationKind[]): Promise<number> {
    return ResellerCommissionModel.countDocuments({
      restaurantId,
      obligationKind: { $in: kinds },
      status: { $ne: 'cancelada' },
    });
  }

  async listByReseller(resellerId: string): Promise<IResellerCommission[]> {
    const docs = await ResellerCommissionModel.find({ resellerId }).sort({ createdAt: -1 }).lean<ResellerCommissionLeanDocument[]>();
    return docs.map(toEntity);
  }

  async markPaid(id: string, paidAt: Date): Promise<IResellerCommission | null> {
    const doc = await ResellerCommissionModel.findOneAndUpdate(
      { _id: id, status: 'pendente' },
      { $set: { status: 'pago', paidAt } },
      { new: true },
    ).lean<ResellerCommissionLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async markCancelled(id: string, cancelledAt: Date): Promise<IResellerCommission | null> {
    const doc = await ResellerCommissionModel.findOneAndUpdate(
      { _id: id, status: 'pendente' },
      { $set: { status: 'cancelada', cancelledAt } },
      { new: true },
    ).lean<ResellerCommissionLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async markObligationRefunded(id: string, obligationRefundedAt: Date): Promise<IResellerCommission | null> {
    const doc = await ResellerCommissionModel.findOneAndUpdate(
      { _id: id, status: 'pago' },
      { $set: { obligationRefundedAt } },
      { new: true },
    ).lean<ResellerCommissionLeanDocument>();
    return doc ? toEntity(doc) : null;
  }
}
