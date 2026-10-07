import { ICustomerSummaryRepository } from '../../../customers-admin/domain/repositories/customer-summary.repository.interface';
import { IRestaurant } from '../../../restaurants/domain/entities/restaurant.entity';
import { IRestaurantRepository } from '../../../restaurants/domain/repositories/restaurant.repository.interface';
import { IWhatsAppConnectionService } from '../../../whatsapp-connection/domain/services/i-whatsapp-connection.service';
import { ICampaign } from '../../domain/entities/campaign.entity';
import { ICampaignOptOutRepository } from '../../domain/repositories/campaign-opt-out.repository.interface';
import { ICampaignRepository } from '../../domain/repositories/campaign.repository.interface';
import { CampaignDispatchService } from './campaign-dispatch.service';

function buildCampaign(overrides: Partial<ICampaign> = {}): ICampaign {
  return {
    id: 'camp-1',
    restaurantId: 'r-1',
    message: 'Promoção especial hoje!',
    campaignCode: 'abc123def0',
    status: 'sending',
    totalRecipients: 0,
    sentCount: 0,
    failedCount: 0,
    createdAt: '2026-10-07T12:00:00.000Z',
    ...overrides,
  };
}

function buildRestaurant(overrides: Partial<IRestaurant> = {}): IRestaurant {
  return { id: 'r-1', name: 'Prime Pizza', slug: 'primepizza', isActive: true, businessHours: [], ...overrides } as IRestaurant;
}

describe('CampaignDispatchService', () => {
  function setup(options?: { campaign?: Partial<ICampaign>; summaries?: { customerId: string; name: string; phone?: string; totalOrders: number; totalSpent: number }[]; optedOut?: Set<string> }) {
    const campaign = buildCampaign(options?.campaign);
    const optedOut = options?.optedOut ?? new Set<string>();

    const campaignRepository: Partial<ICampaignRepository> = {
      findById: jest.fn().mockResolvedValue(campaign),
      setTotalRecipients: jest.fn().mockResolvedValue(undefined),
      incrementCounts: jest.fn().mockResolvedValue(undefined),
      markCompleted: jest.fn().mockResolvedValue(undefined),
    };
    const customerSummaryRepository: Partial<ICustomerSummaryRepository> = {
      listByRestaurant: jest.fn().mockResolvedValue(
        options?.summaries ?? [
          { customerId: 'c-1', name: 'Ana', phone: '11999990001', totalOrders: 3, totalSpent: 100 },
          { customerId: 'c-2', name: 'Beto', phone: '11999990002', totalOrders: 1, totalSpent: 30 },
        ],
      ),
    };
    const campaignOptOutRepository: Partial<ICampaignOptOutRepository> = {
      isOptedOut: jest.fn().mockImplementation((_restaurantId: string, customerId: string) => Promise.resolve(optedOut.has(customerId))),
      getOrCreateToken: jest.fn().mockImplementation((_restaurantId: string, customerId: string) => Promise.resolve(`token-${customerId}`)),
    };
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findById: jest.fn().mockResolvedValue(buildRestaurant()),
    };
    const whatsAppConnectionService: Partial<IWhatsAppConnectionService> = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendImageMessage: jest.fn().mockResolvedValue(undefined),
    };

    const service = new CampaignDispatchService(
      campaignRepository as ICampaignRepository,
      customerSummaryRepository as ICustomerSummaryRepository,
      campaignOptOutRepository as ICampaignOptOutRepository,
      restaurantRepository as IRestaurantRepository,
      whatsAppConnectionService as IWhatsAppConnectionService,
      0, // sem espera real nos testes
    );

    return { service, campaignRepository, customerSummaryRepository, campaignOptOutRepository, restaurantRepository, whatsAppConnectionService };
  }

  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  // AC-2/REQ-6 — sem telefone nunca entra; REQ-2 — link de cardápio com o `campaignCode` certo.
  it('envia só pros elegíveis (telefone válido), com a mensagem final certa', async () => {
    const { service, whatsAppConnectionService } = setup({
      summaries: [
        { customerId: 'c-1', name: 'Ana', phone: '11999990001', totalOrders: 3, totalSpent: 100 },
        { customerId: 'c-2', name: 'Beto', totalOrders: 1, totalSpent: 30 }, // sem telefone
      ],
    });

    await service.dispatch('camp-1');

    expect(whatsAppConnectionService.sendMessage).toHaveBeenCalledTimes(1);
    const [restaurantId, phone, message] = (whatsAppConnectionService.sendMessage as jest.Mock).mock.calls[0];
    expect(restaurantId).toBe('r-1');
    expect(phone).toBe('11999990001');
    expect(message).toContain('https://bsdelivery.com.br/primepizza?src=wabot&campaign=abc123def0');
    expect(message).toContain('https://bsdelivery.com.br/sair/token-c-1');
  });

  // AC-2/REQ-5 — descadastrado não recebe.
  it('não envia pra cliente descadastrado daquele restaurante', async () => {
    const { service, whatsAppConnectionService } = setup({ optedOut: new Set(['c-2']) });

    await service.dispatch('camp-1');

    expect(whatsAppConnectionService.sendMessage).toHaveBeenCalledTimes(1);
    expect((whatsAppConnectionService.sendMessage as jest.Mock).mock.calls[0][1]).toBe('11999990001');
  });

  // REQ-4 — campanha com imagem usa `sendImageMessage`, não `sendMessage`.
  it('campanha com imagem usa sendImageMessage, com a legenda certa', async () => {
    const { service, whatsAppConnectionService } = setup({ campaign: { imageUrl: 'https://s3.example.com/campaign.jpg' } });

    await service.dispatch('camp-1');

    expect(whatsAppConnectionService.sendImageMessage).toHaveBeenCalledTimes(2);
    expect(whatsAppConnectionService.sendMessage).not.toHaveBeenCalled();
    const [, , imageUrl, caption] = (whatsAppConnectionService.sendImageMessage as jest.Mock).mock.calls[0];
    expect(imageUrl).toBe('https://s3.example.com/campaign.jpg');
    expect(caption).toContain('Promoção especial hoje!');
  });

  // AC-6/REQ-9 — falha num destinatário não impede os demais; contadores corretos.
  it('falha num destinatário não interrompe os demais; sentCount/failedCount corretos', async () => {
    const { service, campaignRepository, whatsAppConnectionService } = setup();
    (whatsAppConnectionService.sendMessage as jest.Mock).mockRejectedValueOnce(new Error('número inválido')).mockResolvedValueOnce(undefined);

    await service.dispatch('camp-1');

    expect(whatsAppConnectionService.sendMessage).toHaveBeenCalledTimes(2);
    expect(campaignRepository.incrementCounts).toHaveBeenCalledWith('camp-1', { sent: 1 });
    expect(campaignRepository.incrementCounts).toHaveBeenCalledWith('camp-1', { failed: 1 });
    expect(campaignRepository.markCompleted).toHaveBeenCalledWith('camp-1');
  });

  // AC-4/REQ-7 — total de elegíveis gravado antes do envio começar.
  it('grava o total de destinatários elegíveis e marca como concluída ao final', async () => {
    const { service, campaignRepository } = setup();

    await service.dispatch('camp-1');

    expect(campaignRepository.setTotalRecipients).toHaveBeenCalledWith('camp-1', 2);
    expect(campaignRepository.markCompleted).toHaveBeenCalledWith('camp-1');
  });

  it('campanha inexistente não lança e não tenta enviar nada', async () => {
    const { service, campaignRepository, customerSummaryRepository } = setup();
    (campaignRepository.findById as jest.Mock).mockResolvedValue(null);

    await expect(service.dispatch('camp-inexistente')).resolves.toBeUndefined();
    expect(customerSummaryRepository.listByRestaurant).not.toHaveBeenCalled();
  });
});
