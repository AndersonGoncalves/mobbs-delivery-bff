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
  /**
   * Achado de auditoria pré-produção (31/10/2026) — "painel administrativo da plataforma (1
   * query por restaurante cadastrado)": `GET /platform/billing/restaurants` chamava
   * `findOpenByRestaurantId` uma vez por restaurante só pra somar `totalDueCents`/checar
   * `hasPendingTechnicalIssue` — a correção anterior (`GET /platform/restaurants`) não cobriu
   * esta rota irmã. Agregação ÚNICA pra TODOS os restaurantes de uma vez.
   */
  getOpenSummaryByRestaurant(): Promise<Map<string, { openObligationsCount: number; totalDueCents: number; overdueCents: number; hasPendingTechnicalIssue: boolean }>>;
  /** specs/0175 T053 — faturas ANUAIS (adesão/renovação) não canceladas de todos os restaurantes, numa
   * query só, pra situação anual da lista da plataforma (`annualStandingOf`). */
  findAnnualNotCancelled(): Promise<ISubscriptionObligation[]>;
  /** `awaiting_issue`/`issue_failed` — elegíveis pra emissão (REQ-9/REQ-12). Filtra por
   * restaurante quando informado (reprocessamento administrativo de uma loja, REQ-32). */
  findEligibleForIssuance(restaurantId?: string): Promise<ISubscriptionObligation[]>;
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
  /** specs/0175 T054 — guarda o id da cobrança do Asaas assim que ela existe, antes do QR do Pix. */
  recordAsaasCharge(id: string, asaasChargeId: string): Promise<void>;
  markPaid(id: string, paidAt: Date): Promise<ISubscriptionObligation>;
  markOverdue(id: string): Promise<ISubscriptionObligation>;
  markRefunded(id: string): Promise<ISubscriptionObligation>;
  markPartiallyRefunded(id: string): Promise<ISubscriptionObligation>;
  /** specs/0175 REQ-23 (opção C) — "Cobrar de novo": só de `refunded`; volta a `awaiting_issue`,
   * tira o Pix/cobrança antigos e guarda a cobrança estornada em `refundedChargeIds`. `null` se a
   * fatura não estava `refunded` (decisão já tomada ou estado errado). */
  reopenForReissue(id: string): Promise<ISubscriptionObligation | null>;
  /** specs/0175 REQ-23 (opção C) — "Perdoar": só de `refunded`, vira `cancelled`. `null` idem. */
  cancelRefunded(id: string): Promise<ISubscriptionObligation | null>;
  markCancelled(id: string): Promise<ISubscriptionObligation>;
}
