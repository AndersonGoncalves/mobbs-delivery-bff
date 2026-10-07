import { ICampaignOptOutRepository } from '../../domain/repositories/campaign-opt-out.repository.interface';
import { CampaignOptOutModel } from '../models/campaign-opt-out.mongoose.model';

interface CampaignOptOutLeanDocument {
  restaurantId: string;
  customerId: string;
  token: string;
  optedOutAt?: Date;
}

export class CampaignOptOutMongooseRepository implements ICampaignOptOutRepository {
  async isOptedOut(restaurantId: string, customerId: string): Promise<boolean> {
    const doc = await CampaignOptOutModel.findOne({ restaurantId, customerId }).lean<CampaignOptOutLeanDocument>();
    return !!doc?.optedOutAt;
  }

  /**
   * `findOneAndUpdate` com `upsert` + `setOnInsert` — cria o registro (token gerado pelo default
   * do schema) só se ainda não existir, atômico, sem corrida entre duas campanhas resolvendo o
   * mesmo cliente ao mesmo tempo.
   */
  async getOrCreateToken(restaurantId: string, customerId: string): Promise<string> {
    const doc = await CampaignOptOutModel.findOneAndUpdate(
      { restaurantId, customerId },
      { $setOnInsert: { restaurantId, customerId } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean<CampaignOptOutLeanDocument>();
    return doc!.token;
  }

  async optOutByToken(token: string): Promise<{ restaurantId: string; customerId: string } | null> {
    // Idempotente: já descadastrado continua devolvendo os mesmos dados, sem re-setar `optedOutAt`
    // (REQ-5 — acessar o link 2x não quebra nada).
    const doc = await CampaignOptOutModel.findOneAndUpdate(
      { token },
      [{ $set: { optedOutAt: { $ifNull: ['$optedOutAt', '$$NOW'] } } }],
      { new: true },
    ).lean<CampaignOptOutLeanDocument>();
    return doc ? { restaurantId: doc.restaurantId, customerId: doc.customerId } : null;
  }
}
