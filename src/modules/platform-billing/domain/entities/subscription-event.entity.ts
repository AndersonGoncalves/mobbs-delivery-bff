/**
 * specs/0175-cobranca-assinatura-asaas REQ-7/REQ-19/REQ-20/REQ-32 — log append-only por
 * obligation: toda mudança de estado fica registrada antes de ser reconhecida (REQ-19 "registrar
 * o evento duravelmente antes de reconhecê-lo"), pra auditoria (REQ-32) e dedupe de webhook
 * (REQ-20 — `asaasEventId` com índice único quando o payload do Asaas trouxer um id de evento).
 */
export type SubscriptionEventType =
  | 'issued'
  | 'issue_failed'
  | 'webhook_received'
  | 'reconciled'
  | 'refunded'
  | 'partially_refunded'
  | 'expired'
  | 'manual_exception'
  | 'reprocessed';

export interface ISubscriptionEvent {
  id: string;
  obligationId: string;
  type: SubscriptionEventType;
  /** Payload bruto recebido/produzido — auditoria (REQ-32), nunca reprocessado estruturalmente. */
  payload?: Record<string, unknown>;
  /** Id do evento do Asaas, quando presente no payload — dedupe (REQ-20/AC-15), nunca tratado
   * como garantia de unicidade da COBRANÇA em si (essa vem do índice da obligation). */
  asaasEventId?: string;
  /** `'system'` (automático) ou o e-mail do administrador (REQ-32, ações manuais). */
  actor: string;
  createdAt: Date;
}
