import { IRating } from '../entities/rating.entity';

export interface UpsertRatingInput {
  restaurantId: string;
  customerId: string;
  score: number;
  comment?: string;
}

export interface RatingPage {
  items: IRating[];
  total: number;
}

export interface RatingStats {
  average: number;
  count: number;
}

export interface IRatingRepository {
  /** Um `Rating` por `(restaurantId, customerId)` — avaliar de novo substitui o anterior por
   * completo (score + comment), nunca acumula histórico. */
  upsert(input: UpsertRatingInput): Promise<IRating>;

  /** Mais recente primeiro (`updatedAt` desc) — reavaliar sobe o rating pro topo da lista, mesmo
   * critério de "mais recente" usado em outras listagens do sistema. */
  findManyByRestaurant(restaurantId: string, page: number, pageSize: number): Promise<RatingPage>;

  /** Média (arredondada pra 1 casa decimal) e contagem total — recalculado a cada `upsert()`
   * pelo controller, nunca perdido em `Restaurant.rating`/`Restaurant.ratingCount`. */
  getStats(restaurantId: string): Promise<RatingStats>;

  /**
   * specs/0078-resposta-restaurante-avaliacoes REQ-2/REQ-3 — `findOneAndUpdate({ _id: id,
   * restaurantId })` num só passo (garante o isolamento multi-tenant sem uma query extra pra
   * conferir dono antes); `null` quando o rating não existe OU não é deste restaurante (o
   * controller trata os dois casos como 404, sem distinguir — nunca revela se o id existe em
   * outro restaurante). Upsert: uma nova resposta substitui a anterior, nunca acumula.
   */
  reply(id: string, restaurantId: string, text: string): Promise<IRating | null>;
}
