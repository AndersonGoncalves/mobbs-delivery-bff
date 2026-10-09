import { ICampaign } from '../entities/campaign.entity';

export interface CampaignInput {
  message: string;
  imageUrl?: string;
  campaignCode: string;
  /** Pedido explícito do usuário (follow-up) — ver `ICampaign.excludedCustomerIds`. */
  excludedCustomerIds: string[];
}

export interface ICampaignRepository {
  create(restaurantId: string, input: CampaignInput): Promise<ICampaign>;
  findById(id: string): Promise<ICampaign | null>;
  /** REQ-7 — mais recente primeiro. */
  findManyByRestaurant(restaurantId: string): Promise<ICampaign[]>;
  /** Chamado uma vez, assim que `CampaignDispatchService` resolve a lista de elegíveis. */
  setTotalRecipients(id: string, totalRecipients: number): Promise<void>;
  /** `$inc` atômico — chamado um envio de cada vez, nunca em lote (REQ-9: falha individual não
   * para o envio dos demais, então o contador avança um a um). */
  incrementCounts(id: string, delta: { sent?: number; failed?: number }): Promise<void>;
  markCompleted(id: string): Promise<void>;
}
