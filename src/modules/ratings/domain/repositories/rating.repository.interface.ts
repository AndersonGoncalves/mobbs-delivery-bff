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
}
