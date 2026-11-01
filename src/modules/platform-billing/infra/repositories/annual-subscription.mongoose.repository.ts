import type { IAnnualSubscription } from '../../domain/entities/annual-subscription.entity';
import type { IAnnualSubscriptionRepository } from '../../domain/repositories/annual-subscription.repository.interface';
import { AnnualSubscriptionModel } from '../models/annual-subscription.mongoose.model';

type AnnualSubscriptionLeanDocument = Omit<IAnnualSubscription, 'id'> & { _id: string };

function toEntity(doc: AnnualSubscriptionLeanDocument): IAnnualSubscription {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    joinedAt: doc.joinedAt,
    renewalActive: doc.renewalActive,
    cancelledAt: doc.cancelledAt,
    cancelledBy: doc.cancelledBy,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export class AnnualSubscriptionMongooseRepository implements IAnnualSubscriptionRepository {
  async findActiveByRestaurantId(restaurantId: string): Promise<IAnnualSubscription | null> {
    const doc = await AnnualSubscriptionModel.findOne({ restaurantId, renewalActive: true }).lean<AnnualSubscriptionLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  // Achado de auditoria pré-produção (31/10/2026) — "painel administrativo da plataforma (1
  // query por restaurante cadastrado)": uma só query cobrindo TODOS os restaurantes com
  // assinatura anual ATIVA, em vez de `findActiveByRestaurantId` por restaurante
  // (`PlatformController.buildBillingRow`).
  async getActiveRestaurantIds(): Promise<Set<string>> {
    const docs = await AnnualSubscriptionModel.find({ renewalActive: true }, { restaurantId: 1 }).lean<{ restaurantId: string }[]>();
    return new Set(docs.map((doc) => doc.restaurantId));
  }

  async findByRestaurantId(restaurantId: string): Promise<IAnnualSubscription[]> {
    const docs = await AnnualSubscriptionModel.find({ restaurantId }).sort({ joinedAt: -1 }).lean<AnnualSubscriptionLeanDocument[]>();
    return docs.map(toEntity);
  }

  async create(restaurantId: string, joinedAt: Date): Promise<IAnnualSubscription> {
    // Índice único parcial (`restaurantId`, só `renewalActive: true`) garante, sob concorrência,
    // que uma 2ª tentativa simultânea falha aqui — o serviço (`AnnualSubscriptionService`) checa
    // `findActiveByRestaurantId` antes, mas a garantia real de "nunca duas ativas" é do índice.
    const doc = await AnnualSubscriptionModel.create({ restaurantId, joinedAt, renewalActive: true });
    return toEntity(doc.toObject() as AnnualSubscriptionLeanDocument);
  }

  async cancelRenewal(id: string, cancelledAt: Date, cancelledBy: string): Promise<IAnnualSubscription> {
    const doc = await AnnualSubscriptionModel.findByIdAndUpdate(
      id,
      { $set: { renewalActive: false, cancelledAt, cancelledBy } },
      { new: true },
    ).lean<AnnualSubscriptionLeanDocument>();
    return toEntity(doc as AnnualSubscriptionLeanDocument);
  }
}
