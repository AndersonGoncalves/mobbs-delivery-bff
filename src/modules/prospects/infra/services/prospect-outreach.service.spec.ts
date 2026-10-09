import { IPlatformWhatsAppConnectionService } from '../../../whatsapp-connection/domain/services/i-platform-whatsapp-connection.service';
import { IProspect } from '../../domain/entities/prospect.entity';
import { IProspectRepository } from '../../domain/repositories/prospect.repository.interface';
import { ProspectOutreachService } from './prospect-outreach.service';

function buildProspect(overrides: Partial<IProspect> = {}): IProspect {
  return {
    id: 'p-1',
    placeId: 'place-1',
    establishmentName: 'Pizzaria do João',
    category: 'pizzaria',
    phone: '85986404604',
    latitude: -3.73,
    longitude: -38.52,
    createdAt: '2026-10-08T12:00:00.000Z',
    ...overrides,
  };
}

describe('ProspectOutreachService (specs/0124-campanha-whatsapp-prospects)', () => {
  function setup(options?: { prospects?: Record<string, IProspect | null> }) {
    const prospects = options?.prospects ?? { 'p-1': buildProspect(), 'p-2': buildProspect({ id: 'p-2', phone: '85988887777' }) };

    const prospectRepository: Partial<IProspectRepository> = {
      findById: jest.fn().mockImplementation((id: string) => Promise.resolve(prospects[id] ?? null)),
      markContacted: jest.fn().mockResolvedValue(undefined),
    };
    const platformWhatsAppConnectionService: Partial<IPlatformWhatsAppConnectionService> = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      sendImageMessage: jest.fn().mockResolvedValue(undefined),
    };

    const service = new ProspectOutreachService(
      prospectRepository as IProspectRepository,
      platformWhatsAppConnectionService as IPlatformWhatsAppConnectionService,
      0, // sem espera real nos testes
    );

    return { service, prospectRepository, platformWhatsAppConnectionService };
  }

  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  // AC-4/REQ-6/REQ-7 — envia e grava lastContactedAt.
  it('envia pros prospects selecionados e grava lastContactedAt em cada um', async () => {
    const { service, prospectRepository, platformWhatsAppConnectionService } = setup();

    const results = await service.contactProspects(['p-1', 'p-2'], 'Olá {nomeContato}!');

    expect(platformWhatsAppConnectionService.sendMessage).toHaveBeenCalledTimes(2);
    expect(platformWhatsAppConnectionService.sendMessage).toHaveBeenCalledWith('85986404604', 'Olá Pizzaria do João!');
    expect(prospectRepository.markContacted).toHaveBeenCalledWith('p-1', expect.any(String));
    expect(prospectRepository.markContacted).toHaveBeenCalledWith('p-2', expect.any(String));
    expect(results).toEqual([
      { prospectId: 'p-1', success: true },
      { prospectId: 'p-2', success: true },
    ]);
  });

  // REQ-3.1 — usa contactName quando preenchido, senão establishmentName.
  it('usa contactName no lugar do nome do estabelecimento quando preenchido', async () => {
    const { service, platformWhatsAppConnectionService } = setup({
      prospects: { 'p-1': buildProspect({ contactName: 'Seu João' }) },
    });

    await service.contactProspects(['p-1'], 'Oi {nomeContato}');

    expect(platformWhatsAppConnectionService.sendMessage).toHaveBeenCalledWith('85986404604', 'Oi Seu João');
  });

  // REQ-6 — imagem opcional usa sendImageMessage.
  it('com imagem, usa sendImageMessage em vez de sendMessage', async () => {
    const { service, platformWhatsAppConnectionService } = setup();

    await service.contactProspects(['p-1'], 'Olá!', 'https://s3.example.com/outreach.jpg');

    expect(platformWhatsAppConnectionService.sendImageMessage).toHaveBeenCalledWith('85986404604', 'https://s3.example.com/outreach.jpg', 'Olá!');
    expect(platformWhatsAppConnectionService.sendMessage).not.toHaveBeenCalled();
  });

  // AC-5/REQ-8 — falha num prospect não impede os demais.
  it('falha num prospect não interrompe o envio dos demais', async () => {
    const { service, platformWhatsAppConnectionService, prospectRepository } = setup();
    (platformWhatsAppConnectionService.sendMessage as jest.Mock)
      .mockRejectedValueOnce(new Error('número inválido'))
      .mockResolvedValueOnce(undefined);

    const results = await service.contactProspects(['p-1', 'p-2'], 'Olá!');

    expect(platformWhatsAppConnectionService.sendMessage).toHaveBeenCalledTimes(2);
    expect(results).toEqual([
      { prospectId: 'p-1', success: false, error: 'número inválido' },
      { prospectId: 'p-2', success: true },
    ]);
    expect(prospectRepository.markContacted).toHaveBeenCalledTimes(1);
    expect(prospectRepository.markContacted).toHaveBeenCalledWith('p-2', expect.any(String));
  });

  // REQ-5 — defesa no backend contra prospect sem telefone.
  it('prospect sem telefone falha sem tentar enviar', async () => {
    const { service, platformWhatsAppConnectionService } = setup({
      prospects: { 'p-1': buildProspect({ phone: undefined }) },
    });

    const results = await service.contactProspects(['p-1'], 'Olá!');

    expect(platformWhatsAppConnectionService.sendMessage).not.toHaveBeenCalled();
    expect(results).toEqual([{ prospectId: 'p-1', success: false, error: 'Prospect sem telefone válido' }]);
  });

  it('prospect inexistente falha sem tentar enviar', async () => {
    const { service, platformWhatsAppConnectionService } = setup({ prospects: { 'p-1': null } });

    const results = await service.contactProspects(['p-1'], 'Olá!');

    expect(platformWhatsAppConnectionService.sendMessage).not.toHaveBeenCalled();
    expect(results).toEqual([{ prospectId: 'p-1', success: false, error: 'Prospect não encontrado' }]);
  });

  // AC-6/REQ-9 — reenvio sempre permitido, sem checar lastContactedAt nenhum.
  it('reenviar pra um prospect já contatado é permitido e atualiza lastContactedAt', async () => {
    const { service, prospectRepository } = setup({
      prospects: { 'p-1': buildProspect({ lastContactedAt: '2026-10-01T10:00:00.000Z' }) },
    });

    const results = await service.contactProspects(['p-1'], 'Olá de novo!');

    expect(results[0]).toEqual({ prospectId: 'p-1', success: true });
    expect(prospectRepository.markContacted).toHaveBeenCalledWith('p-1', expect.any(String));
  });

  // AC-8/AC-9/REQ-11/REQ-11.1 — envio avulso, sem nenhum registro de prospect envolvido.
  describe('contactAdHoc', () => {
    it('REQ-11: envia só pro número informado, sem mexer em nenhum prospect', async () => {
      const { service, platformWhatsAppConnectionService, prospectRepository } = setup();

      await service.contactAdHoc('85999998888', 'Olá {nomeContato}!');

      expect(platformWhatsAppConnectionService.sendMessage).toHaveBeenCalledWith('85999998888', 'Olá !');
      expect(prospectRepository.findById).not.toHaveBeenCalled();
      expect(prospectRepository.markContacted).not.toHaveBeenCalled();
    });

    it('com imagem, usa sendImageMessage', async () => {
      const { service, platformWhatsAppConnectionService } = setup();

      await service.contactAdHoc('85999998888', 'Olá!', 'https://s3.example.com/outreach.jpg');

      expect(platformWhatsAppConnectionService.sendImageMessage).toHaveBeenCalledWith('85999998888', 'https://s3.example.com/outreach.jpg', 'Olá!');
    });

    // AC-9/REQ-11.1 — falha propaga (controller converte pra uma resposta clara).
    it('REQ-11.1: propaga a falha do envio pra quem chamou', async () => {
      const { service, platformWhatsAppConnectionService } = setup();
      (platformWhatsAppConnectionService.sendMessage as jest.Mock).mockRejectedValue(new Error('número inválido'));

      await expect(service.contactAdHoc('85999998888', 'Olá!')).rejects.toThrow('número inválido');
    });
  });
});
