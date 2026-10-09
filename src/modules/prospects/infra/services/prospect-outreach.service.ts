import { DEFAULT_CAMPAIGN_SEND_INTERVAL_MS } from '../../../campaigns/infra/services/campaign-dispatch.service';
import { IPlatformWhatsAppConnectionService } from '../../../whatsapp-connection/domain/services/i-platform-whatsapp-connection.service';
import { buildProspectOutreachMessage } from '../../domain/build-prospect-outreach-message';
import { IProspectRepository } from '../../domain/repositories/prospect.repository.interface';
import { IProspectOutreachService, ProspectContactResult } from '../../domain/services/i-prospect-outreach.service';

/**
 * specs/0124-campanha-whatsapp-prospects — envia a mensagem de abordagem pros prospects
 * selecionados (REQ-6) ou pra um número avulso (REQ-11), pela sessão de WhatsApp da plataforma.
 * Mesmo intervalo entre mensagens de `specs/0092-campanha-whatsapp-clientes`
 * (`DEFAULT_CAMPAIGN_SEND_INTERVAL_MS`, decisão do usuário: reaproveitar a mesma constante).
 */
export class ProspectOutreachService implements IProspectOutreachService {
  constructor(
    private readonly prospectRepository: IProspectRepository,
    private readonly platformWhatsAppConnectionService: IPlatformWhatsAppConnectionService,
    /** Injetável pra testes (0 = sem espera real); produção usa o padrão de 3s. */
    private readonly intervalMs: number = DEFAULT_CAMPAIGN_SEND_INTERVAL_MS,
  ) {}

  async contactProspects(prospectIds: string[], message: string, imageUrl?: string): Promise<ProspectContactResult[]> {
    const results: ProspectContactResult[] = [];

    for (let index = 0; index < prospectIds.length; index++) {
      if (index > 0) await this.wait(this.intervalMs);
      const prospectId = prospectIds[index];

      try {
        const prospect = await this.prospectRepository.findById(prospectId);
        if (!prospect) throw new Error('Prospect não encontrado');
        // REQ-5 — defesa também no backend; a tela já desabilita a seleção pra quem não tem telefone.
        if (!prospect.phone) throw new Error('Prospect sem telefone válido');

        const contactLabel = prospect.contactName ?? prospect.establishmentName;
        const finalMessage = buildProspectOutreachMessage(message, contactLabel);

        if (imageUrl) {
          await this.platformWhatsAppConnectionService.sendImageMessage(prospect.phone, imageUrl, finalMessage);
        } else {
          await this.platformWhatsAppConnectionService.sendMessage(prospect.phone, finalMessage);
        }

        // REQ-7/REQ-9 — grava (ou atualiza, num reenvio) a data do envio bem-sucedido.
        await this.prospectRepository.markContacted(prospectId, new Date().toISOString());
        results.push({ prospectId, success: true });
      } catch (error) {
        // REQ-8 — falha individual nunca propaga: não pode travar o envio dos demais.
        console.error(`[prospects] falha ao enviar mensagem de abordagem pro prospect ${prospectId}:`, error);
        results.push({ prospectId, success: false, error: error instanceof Error ? error.message : 'Falha ao enviar' });
      }
    }

    return results;
  }

  async contactAdHoc(phone: string, message: string, imageUrl?: string): Promise<void> {
    // REQ-11, nota da spec — sem nome associado, {nomeContato} vira string vazia.
    const finalMessage = buildProspectOutreachMessage(message, '');
    if (imageUrl) {
      await this.platformWhatsAppConnectionService.sendImageMessage(phone, imageUrl, finalMessage);
    } else {
      await this.platformWhatsAppConnectionService.sendMessage(phone, finalMessage);
    }
  }

  private wait(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
