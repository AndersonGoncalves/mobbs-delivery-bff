/**
 * specs/0092-campanha-whatsapp-clientes REQ-4 — orquestra o envio de uma campanha já criada
 * (`CampaignsController.POST /restaurants/me/campaigns` chama isto sem `await`, fire-and-forget,
 * mesmo padrão de `WhatsAppConnectionService.restoreConnectedSessions`, `specs/0066`). Nunca
 * lança — qualquer erro fica só no log, a campanha já foi criada e o operador já recebeu `201`.
 */
export interface ICampaignDispatchService {
  dispatch(campaignId: string): Promise<void>;
}
