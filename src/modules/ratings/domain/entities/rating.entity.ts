/**
 * specs/0032-ajustes-diversos-rating-taxa-entrega REQ-6 — avaliação de um cliente sobre um
 * restaurante (não sobre um pedido específico ou produto — decisão do usuário: "avaliar o
 * restaurante"). Um `Rating` por `(restaurantId, customerId)` — avaliar de novo atualiza o
 * existente (upsert), não cria um segundo.
 */
/**
 * specs/0078-resposta-restaurante-avaliacoes REQ-1 — resposta do restaurante a este `Rating`,
 * opcional; upsert (uma resposta só por avaliação, uma nova substitui a anterior — REQ-2, mesmo
 * raciocínio do próprio `Rating` sobre `(restaurantId, customerId)`).
 */
export interface IRatingReply {
  text: string;
  createdAt: Date;
}

export interface IRating {
  id: string;
  restaurantId: string;
  customerId: string;
  /** 1 a 5, validado no schema (`ratings.schemas.ts`). */
  score: number;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
  reply?: IRatingReply;
}
