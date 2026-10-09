/** specs/0124-campanha-whatsapp-prospects — resultado por prospect de um envio em lote
 * (REQ-6/REQ-7/REQ-8). */
export interface ProspectContactResult {
  prospectId: string;
  success: boolean;
  error?: string;
}

/**
 * specs/0124-campanha-whatsapp-prospects — orquestra o envio da mensagem de abordagem comercial
 * pela sessão de WhatsApp da plataforma.
 */
export interface IProspectOutreachService {
  /** REQ-6/REQ-7/REQ-8/REQ-9 — envia um a um (com intervalo entre mensagens); falha individual
   * não interrompe os demais (REQ-8); sucesso grava `lastContactedAt` (REQ-7), inclusive num
   * reenvio (REQ-9, sobrescreve). */
  contactProspects(prospectIds: string[], message: string, imageUrl?: string): Promise<ProspectContactResult[]>;
  /** REQ-11/REQ-11.1 — número avulso, fora da lista de prospects; nunca cria/atualiza nenhum
   * registro (ver "Fora de escopo" da spec). */
  contactAdHoc(phone: string, message: string, imageUrl?: string): Promise<void>;
}
