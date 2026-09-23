import { PresenceHeartbeatModel } from '../models/presence-heartbeat.mongoose.model';
import { PresenceMongooseRepository } from './presence.mongoose.repository';

// specs/0045-usuarios-online-app AC-2/T012 — mock do Model (não integração real de Mongo), mesmo
// padrão-exceção de migrate-operator-roles-to-dono.spec.ts: normalmente nenhum *.mongoose.repository.ts
// tem spec próprio (só os controllers, via repositório mockado), mas aqui é a própria peça de
// infra que precisa ser validada. A "janela de tempo" da AC-2 (sessões fora dos últimos 90s não
// contam) é responsabilidade do índice TTL declarado no model, não algo observável num teste
// unitário — o que dá pra verificar aqui é que `countActive` NÃO filtra manualmente por tempo
// (confia inteiramente no TTL) e que `upsertHeartbeat` sempre atualiza `updatedAt` (renovando o
// TTL a cada heartbeat).
jest.mock('../models/presence-heartbeat.mongoose.model', () => ({
  PresenceHeartbeatModel: { findOneAndUpdate: jest.fn(), countDocuments: jest.fn() },
}));

describe('PresenceMongooseRepository', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('upsertHeartbeat: upsert por restaurantId+sessionId, sempre renovando updatedAt', async () => {
    (PresenceHeartbeatModel.findOneAndUpdate as jest.Mock).mockResolvedValue({});
    const repository = new PresenceMongooseRepository();

    await repository.upsertHeartbeat('r-1', 'sess-1');

    expect(PresenceHeartbeatModel.findOneAndUpdate).toHaveBeenCalledWith(
      { restaurantId: 'r-1', sessionId: 'sess-1' },
      { $set: { updatedAt: expect.any(Date) } },
      { upsert: true },
    );
  });

  it('AC-2: countActive conta só por restaurantId, sem filtro manual de janela — confia no TTL do model', async () => {
    (PresenceHeartbeatModel.countDocuments as jest.Mock).mockResolvedValue(5);
    const repository = new PresenceMongooseRepository();

    const count = await repository.countActive('r-1');

    expect(PresenceHeartbeatModel.countDocuments).toHaveBeenCalledWith({ restaurantId: 'r-1' });
    expect(count).toBe(5);
  });
});
