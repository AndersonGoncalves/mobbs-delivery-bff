import type { ISubscriptionEvent } from '../../domain/entities/subscription-event.entity';
import type { ISubscriptionEventRepository } from '../../domain/repositories/subscription-event.repository.interface';
import { SubscriptionEventModel } from '../models/subscription-event.mongoose.model';

type EventLeanDocument = Omit<ISubscriptionEvent, 'id'> & { _id: string };

function toEntity(doc: EventLeanDocument): ISubscriptionEvent {
  return {
    id: doc._id,
    obligationId: doc.obligationId,
    type: doc.type,
    payload: doc.payload,
    asaasEventId: doc.asaasEventId,
    actor: doc.actor,
    createdAt: doc.createdAt,
  };
}

export class SubscriptionEventMongooseRepository implements ISubscriptionEventRepository {
  async append(input: Omit<ISubscriptionEvent, 'id' | 'createdAt'>): Promise<{ event: ISubscriptionEvent; wasAlreadyRecorded: boolean }> {
    // Dedupe pelo par (obligationId, asaasEventId) — índice único garante a atomicidade sob
    // concorrência (plan.md §2): tenta inserir direto e, se já existir (erro 11000), busca e
    // devolve o existente — nunca um find-then-create (que teria uma janela de corrida real
    // entre o check e a criação).
    try {
      const doc = await SubscriptionEventModel.create(input);
      return { event: toEntity(doc.toObject() as EventLeanDocument), wasAlreadyRecorded: false };
    } catch (error) {
      const isDuplicateKey = typeof error === 'object' && error !== null && 'code' in error && (error as { code: number }).code === 11000;
      if (!isDuplicateKey || !input.asaasEventId) throw error;
      const existing = await SubscriptionEventModel.findOne({ obligationId: input.obligationId, asaasEventId: input.asaasEventId }).lean<EventLeanDocument>();
      return { event: toEntity(existing as EventLeanDocument), wasAlreadyRecorded: true };
    }
  }

  async listByObligation(obligationId: string): Promise<ISubscriptionEvent[]> {
    const docs = await SubscriptionEventModel.find({ obligationId }).sort({ createdAt: -1 }).lean<EventLeanDocument[]>();
    return docs.map(toEntity);
  }
}
