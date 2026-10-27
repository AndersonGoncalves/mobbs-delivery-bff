import type { ISubscriptionObligation } from '../entities/subscription-obligation.entity';

export interface UpsertMonthlyObligationInput {
  restaurantId: string;
  kind: 'monthly' | 'monthly-prorated';
  referenceMonth: string;
  tier: ISubscriptionObligation['tier'];
  settingsVersionId: string;
  revenueCentsUsed?: number;
  amountCents: number;
  roundingDetail?: ISubscriptionObligation['roundingDetail'];
  /** `'exempt'` quando `amountCents === 0`; `'awaiting_issue'` quando há valor a cobrar. */
  status: 'exempt' | 'awaiting_issue';
  dueDate: Date;
}

export interface UpsertAnnualObligationInput {
  restaurantId: string;
  kind: 'annual-initial' | 'annual-renewal';
  coveragePeriod: { start: Date; end: Date };
  tier: ISubscriptionObligation['tier'];
  settingsVersionId: string;
  amountCents: number;
  dueDate: Date;
}

export interface ISubscriptionObligationRepository {
  findById(id: string): Promise<ISubscriptionObligation | null>;
  /** Todo o histórico de um restaurante (REQ-32, mais recente primeiro). */
  findByRestaurantId(restaurantId: string): Promise<ISubscriptionObligation[]>;
  /** Só as relevantes pra calcular bloqueio/exibir pendência — `status` != `paid`/`exempt`/
   * `cancelled` (usada por `recomputeAccessStatus` e pelo resumo exibido ao lojista). */
  findOpenByRestaurantId(restaurantId: string): Promise<ISubscriptionObligation[]>;
  /** `awaiting_issue`/`issue_failed` — elegíveis pra emissão (REQ-9/REQ-12). */
  findEligibleForIssuance(): Promise<ISubscriptionObligation[]>;
  /** `pending`/`overdue` — elegíveis pra reconciliação (REQ-22). Filtra por restaurante quando
   * informado (reconciliação sob demanda de um restaurante específico). */
  findPendingForReconciliation(restaurantId?: string): Promise<ISubscriptionObligation[]>;

  /** Upsert idempotente por `(restaurantId, kind, referenceMonth)` — índice único, nunca duplica
   * mesmo sob concorrência (plan.md §2). Devolve o documento existente OU o recém-criado. */
  upsertMonthly(input: UpsertMonthlyObligationInput): Promise<ISubscriptionObligation>;
  /** Upsert idempotente por `(restaurantId, kind, coveragePeriod.start)` — mesmo raciocínio. */
  upsertAnnual(input: UpsertAnnualObligationInput): Promise<ISubscriptionObligation>;

  markIssued(id: string, data: { asaasChargeId: string; pixPayload: string }, now: Date): Promise<ISubscriptionObligation>;
  markIssueFailed(id: string, reason: string, now: Date): Promise<ISubscriptionObligation>;
  markPaid(id: string, paidAt: Date): Promise<ISubscriptionObligation>;
  markOverdue(id: string): Promise<ISubscriptionObligation>;
  markRefunded(id: string): Promise<ISubscriptionObligation>;
  markPartiallyRefunded(id: string): Promise<ISubscriptionObligation>;
  markCancelled(id: string): Promise<ISubscriptionObligation>;
}
