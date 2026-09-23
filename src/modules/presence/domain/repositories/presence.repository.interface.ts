// specs/0045-usuarios-online-app — presença não é uma entidade de domínio "rica" (plan.md), só
// um registro técnico de heartbeat; a interface reflete isso, sem entity própria.
export interface IPresenceRepository {
  upsertHeartbeat(restaurantId: string, sessionId: string): Promise<void>;
  countActive(restaurantId: string): Promise<number>;
}
