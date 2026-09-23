import { IPresenceRepository } from '../../domain/repositories/presence.repository.interface';
import { PresenceHeartbeatModel } from '../models/presence-heartbeat.mongoose.model';

export class PresenceMongooseRepository implements IPresenceRepository {
  async upsertHeartbeat(restaurantId: string, sessionId: string): Promise<void> {
    await PresenceHeartbeatModel.findOneAndUpdate(
      { restaurantId, sessionId },
      { $set: { updatedAt: new Date() } },
      { upsert: true },
    );
  }

  // specs/0045 ADR — sem filtro manual de janela: o índice TTL do model (ver
  // presence-heartbeat.mongoose.model.ts) já garante que só sobram documentos "frescos" (heartbeat
  // nos últimos 90s), então um countDocuments simples já é a contagem certa.
  async countActive(restaurantId: string): Promise<number> {
    return PresenceHeartbeatModel.countDocuments({ restaurantId });
  }
}
