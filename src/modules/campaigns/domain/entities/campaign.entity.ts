/**
 * docs/architecture/data-model.md §Campaign (specs/0092-campanha-whatsapp-clientes) — campanha
 * promocional de WhatsApp disparada manualmente pelo operador pra todo cliente elegível do
 * restaurante (telefone válido, já fez pedido, não descadastrado). `status` nunca volta de
 * `completed` pra `sending` — uma campanha é disparada uma vez (REQ-4: "um disparo manual por
 * vez"); reenviar é criar uma campanha nova.
 */
export interface ICampaign {
  id: string;
  restaurantId: string;
  message: string;
  imageUrl?: string;
  /** 10 caracteres hex, usado no `?campaign=` do link de cardápio (REQ-2). */
  campaignCode: string;
  status: 'sending' | 'completed';
  /** Só sabido depois de resolver os destinatários elegíveis (`CampaignDispatchService`) — `0`
   * enquanto a campanha ainda não calculou a lista. */
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  completedAt?: string;
}
