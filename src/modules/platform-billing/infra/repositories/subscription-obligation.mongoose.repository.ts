import type { ISubscriptionObligation } from '../../domain/entities/subscription-obligation.entity';
import type {
  ISubscriptionObligationRepository,
  UpsertAnnualObligationInput,
  UpsertMonthlyObligationInput,
} from '../../domain/repositories/subscription-obligation.repository.interface';
import { SubscriptionObligationModel } from '../models/subscription-obligation.mongoose.model';

type ObligationLeanDocument = Omit<ISubscriptionObligation, 'id'> & { _id: string };

function toEntity(doc: ObligationLeanDocument): ISubscriptionObligation {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    kind: doc.kind,
    referenceMonth: doc.referenceMonth,
    coveragePeriod: doc.coveragePeriod,
    tier: doc.tier,
    settingsVersionId: doc.settingsVersionId,
    revenueCentsUsed: doc.revenueCentsUsed,
    amountCents: doc.amountCents,
    roundingDetail: doc.roundingDetail,
    status: doc.status,
    dueDate: doc.dueDate,
    issuedAt: doc.issuedAt,
    paidAt: doc.paidAt,
    issueFailureReason: doc.issueFailureReason,
    asaasChargeId: doc.asaasChargeId,
    pixPayload: doc.pixPayload,
    pixExpiresAt: doc.pixExpiresAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const OPEN_STATUSES = ['awaiting_issue', 'issue_failed', 'pending', 'overdue', 'refunded', 'partially_refunded'];

export class SubscriptionObligationMongooseRepository implements ISubscriptionObligationRepository {
  async findById(id: string): Promise<ISubscriptionObligation | null> {
    const doc = await SubscriptionObligationModel.findById(id).lean<ObligationLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findByRestaurantId(restaurantId: string): Promise<ISubscriptionObligation[]> {
    const docs = await SubscriptionObligationModel.find({ restaurantId }).sort({ dueDate: -1 }).lean<ObligationLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findOpenByRestaurantId(restaurantId: string): Promise<ISubscriptionObligation[]> {
    const docs = await SubscriptionObligationModel.find({ restaurantId, status: { $in: OPEN_STATUSES } })
      .sort({ dueDate: -1 })
      .lean<ObligationLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findEligibleForIssuance(restaurantId?: string): Promise<ISubscriptionObligation[]> {
    const filter: Record<string, unknown> = { status: { $in: ['awaiting_issue', 'issue_failed'] } };
    if (restaurantId) filter.restaurantId = restaurantId;
    const docs = await SubscriptionObligationModel.find(filter).lean<ObligationLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findPendingForReconciliation(restaurantId?: string): Promise<ISubscriptionObligation[]> {
    const filter: Record<string, unknown> = { status: { $in: ['pending', 'overdue'] } };
    if (restaurantId) filter.restaurantId = restaurantId;
    const docs = await SubscriptionObligationModel.find(filter).lean<ObligationLeanDocument[]>();
    return docs.map(toEntity);
  }

  async upsertMonthly(input: UpsertMonthlyObligationInput): Promise<ISubscriptionObligation> {
    const doc = await SubscriptionObligationModel.findOneAndUpdate(
      { restaurantId: input.restaurantId, kind: input.kind, referenceMonth: input.referenceMonth },
      {
        $setOnInsert: {
          restaurantId: input.restaurantId,
          kind: input.kind,
          referenceMonth: input.referenceMonth,
          tier: input.tier,
          settingsVersionId: input.settingsVersionId,
          revenueCentsUsed: input.revenueCentsUsed,
          amountCents: input.amountCents,
          roundingDetail: input.roundingDetail,
          status: input.status,
          dueDate: input.dueDate,
        },
      },
      { upsert: true, new: true },
    ).lean<ObligationLeanDocument>();
    return toEntity(doc as ObligationLeanDocument);
  }

  async upsertAnnual(input: UpsertAnnualObligationInput): Promise<ISubscriptionObligation> {
    const key = { restaurantId: input.restaurantId, kind: input.kind, 'coveragePeriod.start': input.coveragePeriod.start };

    // Índice único por (restaurantId, kind, coveragePeriod.start) — se já existe um documento
    // CANCELADO com essa mesma chave (ex.: desistência e nova adesão no mesmo dia), o
    // $setOnInsert abaixo nunca dispara (o upsert encontra esse documento e não insere um novo),
    // devolvendo a sobra cancelada intocada pra uma assinatura que está ativa de verdade — bug
    // real encontrado em produção (specs/0175). Revive esse documento em vez de reaproveitá-lo.
    const existing = await SubscriptionObligationModel.findOne(key).lean<ObligationLeanDocument>();
    if (existing && existing.status === 'cancelled') {
      const revived = await SubscriptionObligationModel.findOneAndUpdate(
        key,
        {
          $set: {
            coveragePeriod: input.coveragePeriod,
            tier: input.tier,
            settingsVersionId: input.settingsVersionId,
            amountCents: input.amountCents,
            status: 'awaiting_issue',
            dueDate: input.dueDate,
          },
          $unset: { issuedAt: 1, paidAt: 1, issueFailureReason: 1, asaasChargeId: 1, pixPayload: 1, pixExpiresAt: 1 },
        },
        { new: true },
      ).lean<ObligationLeanDocument>();
      return toEntity(revived as ObligationLeanDocument);
    }

    const doc = await SubscriptionObligationModel.findOneAndUpdate(
      key,
      {
        $setOnInsert: {
          restaurantId: input.restaurantId,
          kind: input.kind,
          coveragePeriod: input.coveragePeriod,
          tier: input.tier,
          settingsVersionId: input.settingsVersionId,
          amountCents: input.amountCents,
          status: 'awaiting_issue',
          dueDate: input.dueDate,
        },
      },
      { upsert: true, new: true },
    ).lean<ObligationLeanDocument>();
    return toEntity(doc as ObligationLeanDocument);
  }

  async markIssued(id: string, data: { asaasChargeId: string; pixPayload: string }, now: Date): Promise<ISubscriptionObligation> {
    const doc = await SubscriptionObligationModel.findByIdAndUpdate(
      id,
      { $set: { status: 'pending', asaasChargeId: data.asaasChargeId, pixPayload: data.pixPayload, issuedAt: now }, $unset: { issueFailureReason: 1 } },
      { new: true },
    ).lean<ObligationLeanDocument>();
    return toEntity(doc as ObligationLeanDocument);
  }

  async markIssueFailed(id: string, reason: string, now: Date): Promise<ISubscriptionObligation> {
    const doc = await SubscriptionObligationModel.findByIdAndUpdate(
      id,
      { $set: { status: 'issue_failed', issueFailureReason: reason, updatedAt: now } },
      { new: true },
    ).lean<ObligationLeanDocument>();
    return toEntity(doc as ObligationLeanDocument);
  }

  async markPaid(id: string, paidAt: Date): Promise<ISubscriptionObligation> {
    const doc = await SubscriptionObligationModel.findByIdAndUpdate(id, { $set: { status: 'paid', paidAt } }, { new: true }).lean<ObligationLeanDocument>();
    return toEntity(doc as ObligationLeanDocument);
  }

  async markOverdue(id: string): Promise<ISubscriptionObligation> {
    const doc = await SubscriptionObligationModel.findByIdAndUpdate(id, { $set: { status: 'overdue' } }, { new: true }).lean<ObligationLeanDocument>();
    return toEntity(doc as ObligationLeanDocument);
  }

  async markRefunded(id: string): Promise<ISubscriptionObligation> {
    const doc = await SubscriptionObligationModel.findByIdAndUpdate(id, { $set: { status: 'refunded' } }, { new: true }).lean<ObligationLeanDocument>();
    return toEntity(doc as ObligationLeanDocument);
  }

  async markPartiallyRefunded(id: string): Promise<ISubscriptionObligation> {
    const doc = await SubscriptionObligationModel.findByIdAndUpdate(id, { $set: { status: 'partially_refunded' } }, { new: true }).lean<ObligationLeanDocument>();
    return toEntity(doc as ObligationLeanDocument);
  }

  async markCancelled(id: string): Promise<ISubscriptionObligation> {
    const doc = await SubscriptionObligationModel.findByIdAndUpdate(id, { $set: { status: 'cancelled' } }, { new: true }).lean<ObligationLeanDocument>();
    return toEntity(doc as ObligationLeanDocument);
  }
}
