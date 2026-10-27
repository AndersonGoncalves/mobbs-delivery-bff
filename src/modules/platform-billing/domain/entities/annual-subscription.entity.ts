/**
 * specs/0175-cobranca-assinatura-asaas REQ-13..REQ-17 — adesão/renovação anual. Um registro ATIVO
 * por restaurante enquanto `renewalActive`; cancelar a renovação não apaga o registro (mantém
 * histórico de quando aderiu), só marca `cancelledAt`/`cancelledBy` e desliga `renewalActive`.
 *
 * `joinedAt` nunca muda — é a referência de calendário pro aniversário (`addCalendarYear`,
 * `billing-calendar.ts`); a cobertura CORRENTE é calculada a partir dele, nunca armazenada solta
 * (cada obligation anual emitida congela seu próprio `coveragePeriod`, ver
 * `ISubscriptionObligation`).
 */
export interface IAnnualSubscription {
  id: string;
  restaurantId: string;
  joinedAt: Date;
  renewalActive: boolean;
  cancelledAt?: Date;
  cancelledBy?: string;
  createdAt: Date;
  updatedAt: Date;
}
