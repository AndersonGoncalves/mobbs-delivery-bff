/**
 * specs/0124-campanha-whatsapp-prospects REQ-2 — sessão de WhatsApp única da PLATAFORMA (não
 * vinculada a nenhum restaurante), usada só pra abordagem comercial de prospects
 * (specs/0123-prospeccao-restaurantes-google-maps). Mesma mecânica do
 * `IWhatsAppConnectionService` (specs/0013), mas sem o parâmetro `restaurantId` — só existe uma
 * sessão de plataforma por vez.
 */
export interface IPlatformWhatsAppConnectionService {
  /** Inicia (ou reaproveita) o pareamento; retorna o texto bruto do QR code pra exibir na
   * retaguarda, ou `null` se já estiver conectado. */
  startPairing(): Promise<string | null>;

  getConnectionStatus(): Promise<boolean>;

  disconnect(): Promise<void>;

  /** REQ-6/REQ-11 — lança se a sessão não estiver conectada (REQ-10: quem chama já deveria ter
   * checado `getConnectionStatus` antes, mas a implementação não confia cegamente nisso). */
  sendMessage(phone: string, text: string): Promise<void>;

  /** REQ-6 — imagem opcional da mensagem de abordagem; mesma regra de erro de `sendMessage`. */
  sendImageMessage(phone: string, imageUrl: string, caption: string): Promise<void>;

  /** Reabre a sessão da plataforma no boot, só se ela já tiver sido pareada antes (existe um
   * documento salvo); nunca lança — falha aqui não pode derrubar o boot do BFF. */
  restoreConnectedSession(): Promise<void>;
}
