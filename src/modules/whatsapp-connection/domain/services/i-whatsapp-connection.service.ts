/**
 * specs/0013-notificacoes-whatsapp REQ-11/REQ-12 — uma sessão do Baileys por restaurante (nunca
 * uma sessão global da plataforma).
 */
export interface IWhatsAppConnectionService {
  /** REQ-11 — inicia (ou reaproveita) o pareamento; retorna o texto bruto do QR code pra exibir
   * na retaguarda, ou `null` se já estiver conectado. */
  startPairing(restaurantId: string): Promise<string | null>;

  getConnectionStatus(restaurantId: string): Promise<boolean>;

  disconnect(restaurantId: string): Promise<void>;

  /** REQ-1/REQ-2 — usado por `IWhatsAppNotificationService`; lança se a sessão não estiver
   * conectada (quem chama já deveria ter checado `getConnectionStatus`/REQ-12 antes, mas a
   * implementação não confia cegamente nisso). */
  sendMessage(restaurantId: string, phone: string, text: string): Promise<void>;
}
