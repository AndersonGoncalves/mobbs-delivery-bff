/**
 * Pedido explícito do usuário (follow-up) — automação de postagens no Instagram: o operador
 * agenda uma imagem + texto numa data/hora, e um publicador em segundo plano (ver
 * `publish-due-instagram-posts.ts`) publica de verdade na conta Instagram Business vinculada
 * (`Restaurant.instagramAccountId`) quando a hora chega.
 */
export type InstagramPostStatus = 'agendado' | 'publicado' | 'falhou';

export interface IInstagramPost {
  id: string;
  restaurantId: string;
  /** URL pública (S3) da imagem — a Graph API busca essa URL pra criar o container de mídia. */
  imageUrl: string;
  caption: string;
  scheduledAt: string;
  status: InstagramPostStatus;
  publishedAt?: string;
  /** Preenchido só quando `status === 'falhou'` — mostrado na retaguarda pra o operador entender
   * o motivo (ex. token expirado, imagem inválida) sem precisar olhar log de servidor. */
  errorMessage?: string;
  createdAt: string;
}
