import type { ISubscriptionEvent } from '../entities/subscription-event.entity';

export interface ISubscriptionEventRepository {
  /** Grava o evento. Quando `asaasEventId` está presente e já existe pra esta `obligationId`
   * (índice único composto), devolve o evento JÁ EXISTENTE sem duplicar (REQ-20/AC-15) — quem
   * chama decide não reaplicar a baixa quando a gravação não é a "primeira vez". */
  append(input: Omit<ISubscriptionEvent, 'id' | 'createdAt'>): Promise<{ event: ISubscriptionEvent; wasAlreadyRecorded: boolean }>;
  listByObligation(obligationId: string): Promise<ISubscriptionEvent[]>;
}
