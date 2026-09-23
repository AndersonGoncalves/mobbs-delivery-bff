import { Schema, model } from 'mongoose';

const presenceHeartbeatSchema = new Schema({
  restaurantId: { type: String, required: true },
  sessionId: { type: String, required: true },
  updatedAt: { type: Date, required: true, default: Date.now },
});

// specs/0045-usuarios-online-app REQ-2/ADR — índice TTL nativo do Mongo: o documento expira
// sozinho ~90s depois do último heartbeat, sem job de limpeza; `countActive()` confia nisso e só
// faz um `countDocuments({ restaurantId })` simples, sem filtrar por janela de tempo na query.
presenceHeartbeatSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 90 });
// `upsertHeartbeat()` usa exatamente este par como filtro — um heartbeat por sessão por restaurante.
presenceHeartbeatSchema.index({ restaurantId: 1, sessionId: 1 }, { unique: true });

export const PresenceHeartbeatModel = model('PresenceHeartbeat', presenceHeartbeatSchema, 'presence_heartbeats');
