import { IInstagramPostRepository } from './repositories/instagram-post.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { FacebookGraphClient } from '../infra/facebook-graph-client';

/**
 * Pedido explícito do usuário (follow-up) — publicador em segundo plano das postagens agendadas.
 * Chamado periodicamente (`main.ts`, `setInterval`) — ver comentário lá sobre por que esta
 * feature precisa mesmo de um "tick" em processo, diferente do resto do BFF (que hoje só roda
 * ciclos em segundo plano uma vez no boot, `PlatformBillingCycleService`).
 *
 * Cada postagem falha isoladamente (try/catch por item) — uma imagem inválida ou token expirado
 * de UM restaurante nunca impede as postagens agendadas dos demais de saírem.
 */
export class PublishDueInstagramPostsService {
  constructor(
    private readonly postRepository: IInstagramPostRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly graphClient: FacebookGraphClient,
  ) {}

  async run(now: Date = new Date()): Promise<void> {
    const due = await this.postRepository.listDue(now);
    for (const post of due) {
      try {
        const restaurant = await this.restaurantRepository.findById(post.restaurantId);
        if (!restaurant?.instagramAccessToken || !restaurant.instagramAccountId) {
          await this.postRepository.markFailed(post.id, 'Instagram não está mais vinculado a este restaurante.');
          continue;
        }
        const containerId = await this.graphClient.createMediaContainer(
          restaurant.instagramAccessToken,
          restaurant.instagramAccountId,
          post.imageUrl,
          post.caption,
        );
        await this.graphClient.publishMedia(restaurant.instagramAccessToken, restaurant.instagramAccountId, containerId);
        await this.postRepository.markPublished(post.id, new Date().toISOString());
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Falha desconhecida ao publicar.';
        console.error(`[instagram-automation] falha ao publicar postagem ${post.id}:`, error);
        await this.postRepository.markFailed(post.id, message);
      }
    }
  }
}
