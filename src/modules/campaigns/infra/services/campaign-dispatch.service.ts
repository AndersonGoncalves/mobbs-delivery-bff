import { ICustomerSummaryRepository } from '../../../customers-admin/domain/repositories/customer-summary.repository.interface';
import { IRestaurantRepository } from '../../../restaurants/domain/repositories/restaurant.repository.interface';
import { IWhatsAppConnectionService } from '../../../whatsapp-connection/domain/services/i-whatsapp-connection.service';
import { buildCampaignMenuLink, buildCampaignUnsubscribeLink } from '../../domain/campaign-links';
import { buildCampaignMessage } from '../../domain/build-campaign-message';
import { ICampaignOptOutRepository } from '../../domain/repositories/campaign-opt-out.repository.interface';
import { ICampaignRepository } from '../../domain/repositories/campaign.repository.interface';
import { ICampaignDispatchService } from '../../domain/services/i-campaign-dispatch.service';

/** REQ-8 — intervalo entre mensagens da mesma campanha (plan.md ADR: fixo, não configurável). */
export const DEFAULT_CAMPAIGN_SEND_INTERVAL_MS = 3000;

/**
 * specs/0092-campanha-whatsapp-clientes — resolve os destinatários elegíveis (telefone válido,
 * já fez pedido no restaurante — `ICustomerSummaryRepository.listByRestaurant`, mesma base de
 * `specs/0016` —, não descadastrado) e envia um a um, com um intervalo entre cada mensagem
 * (REQ-8). REQ-9: falha individual é logada e pulada, nunca interrompe os demais.
 */
export class CampaignDispatchService implements ICampaignDispatchService {
  constructor(
    private readonly campaignRepository: ICampaignRepository,
    private readonly customerSummaryRepository: ICustomerSummaryRepository,
    private readonly campaignOptOutRepository: ICampaignOptOutRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly whatsAppConnectionService: IWhatsAppConnectionService,
    /** Injetável pra testes (0 = sem espera real); produção usa o padrão de 3s. */
    private readonly intervalMs: number = DEFAULT_CAMPAIGN_SEND_INTERVAL_MS,
  ) {}

  async dispatch(campaignId: string): Promise<void> {
    try {
      const campaign = await this.campaignRepository.findById(campaignId);
      if (!campaign) return;
      const restaurant = await this.restaurantRepository.findById(campaign.restaurantId);
      if (!restaurant) return;

      const summaries = await this.customerSummaryRepository.listByRestaurant(campaign.restaurantId);
      // Pedido explícito do usuário (follow-up) — clientes escolhidos pelo operador pra ficar de
      // fora DESTE disparo (filtro por campanha, não um descadastro — ver REQ-5 abaixo, que
      // continua valendo por cima disso).
      const excluded = new Set(campaign.excludedCustomerIds);
      const eligible: { customerId: string; phone: string }[] = [];
      for (const summary of summaries) {
        // REQ-6 — sem telefone, nunca entra na lista.
        if (!summary.phone) continue;
        // REQ-5 — descadastrado desse restaurante não recebe mais campanhas.
        if (await this.campaignOptOutRepository.isOptedOut(campaign.restaurantId, summary.customerId)) continue;
        if (excluded.has(summary.customerId)) continue;
        eligible.push({ customerId: summary.customerId, phone: summary.phone });
      }

      await this.campaignRepository.setTotalRecipients(campaign.id, eligible.length);

      const menuLink = buildCampaignMenuLink(restaurant.slug, campaign.campaignCode);

      for (let index = 0; index < eligible.length; index++) {
        if (index > 0) await this.wait(this.intervalMs);
        const recipient = eligible[index];
        try {
          const unsubscribeToken = await this.campaignOptOutRepository.getOrCreateToken(campaign.restaurantId, recipient.customerId);
          const message = buildCampaignMessage({
            template: campaign.message,
            menuLink,
            unsubscribeLink: buildCampaignUnsubscribeLink(unsubscribeToken),
          });

          if (campaign.imageUrl) {
            await this.whatsAppConnectionService.sendImageMessage(campaign.restaurantId, recipient.phone, campaign.imageUrl, message);
          } else {
            await this.whatsAppConnectionService.sendMessage(campaign.restaurantId, recipient.phone, message);
          }
          await this.campaignRepository.incrementCounts(campaign.id, { sent: 1 });
        } catch (error) {
          // REQ-9 — nunca propaga: um número com problema não pode travar o envio dos demais.
          console.error(`[campaigns] falha ao enviar a campanha ${campaign.id} para o cliente ${recipient.customerId}:`, error);
          await this.campaignRepository.incrementCounts(campaign.id, { failed: 1 });
        }
      }

      await this.campaignRepository.markCompleted(campaign.id);
    } catch (error) {
      // Erro fora do loop por destinatário (ex. falha ao resolver a lista) — a campanha fica
      // presa em "sending" (risco aceito, ver plan.md), mas não derruba quem chamou (fire-and-forget).
      console.error(`[campaigns] falha ao disparar a campanha ${campaignId}:`, error);
    }
  }

  private wait(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
