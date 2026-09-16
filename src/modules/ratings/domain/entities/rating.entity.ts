/**
 * specs/0032-ajustes-diversos-rating-taxa-entrega REQ-6 — avaliação de um cliente sobre um
 * restaurante (não sobre um pedido específico ou produto — decisão do usuário: "avaliar o
 * restaurante"). Um `Rating` por `(restaurantId, customerId)` — avaliar de novo atualiza o
 * existente (upsert), não cria um segundo.
 */
export interface IRating {
  id: string;
  restaurantId: string;
  customerId: string;
  /** 1 a 5, validado no schema (`ratings.schemas.ts`). */
  score: number;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}
