import type { IAnnualSubscription } from '../entities/annual-subscription.entity';

export interface IAnnualSubscriptionRepository {
  /** A assinatura anual ATIVA do restaurante (`renewalActive: true`), se houver — nunca mais de
   * uma por restaurante (REQ-13 "impedir adesões simultâneas duplicadas"). */
  findActiveByRestaurantId(restaurantId: string): Promise<IAnnualSubscription | null>;
  /**
   * Achado de auditoria pré-produção (31/10/2026) — "painel administrativo da plataforma (1
   * query por restaurante cadastrado)": `GET /platform/billing/restaurants` chamava
   * `findActiveByRestaurantId` uma vez por restaurante só pra checar `hasLegacyAnnualConflict`
   * — agregação ÚNICA pra TODOS de uma vez (o Set tem só os restaurantes com assinatura
   * anual ATIVA; qualquer outro id está implicitamente ausente).
   */
  getActiveRestaurantIds(): Promise<Set<string>>;
  /** Qualquer assinatura (ativa ou já cancelada) — histórico (REQ-32). */
  findByRestaurantId(restaurantId: string): Promise<IAnnualSubscription[]>;
  create(restaurantId: string, joinedAt: Date): Promise<IAnnualSubscription>;
  cancelRenewal(id: string, cancelledAt: Date, cancelledBy: string): Promise<IAnnualSubscription>;
}
