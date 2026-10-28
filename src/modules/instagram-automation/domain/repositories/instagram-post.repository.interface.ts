import { IInstagramPost } from '../entities/instagram-post.entity';

export interface IInstagramPostRepository {
  create(input: { restaurantId: string; imageUrl: string; caption: string; scheduledAt: string }): Promise<IInstagramPost>;
  findById(id: string): Promise<IInstagramPost | null>;
  listByRestaurant(restaurantId: string): Promise<IInstagramPost[]>;
  /** Cancelamento (exclusão) — só permitido pelo controller enquanto `status === 'agendado'`. */
  delete(id: string, restaurantId: string): Promise<boolean>;
  /** Publicador em segundo plano (`publish-due-instagram-posts.ts`) — todos os agendados cuja
   * hora já chegou, de qualquer restaurante (o publicador roda uma vez só, não por restaurante). */
  listDue(now: Date): Promise<IInstagramPost[]>;
  markPublished(id: string, publishedAt: string): Promise<void>;
  markFailed(id: string, errorMessage: string): Promise<void>;
}
