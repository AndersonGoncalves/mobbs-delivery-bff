import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { WhatsAppConnectionService } from './whatsapp-connection.service';

type ConnectSpy = jest.SpyInstance<Promise<void>, [string]>;

describe('WhatsAppConnectionService.restoreConnectedSessions (specs/0066)', () => {
  function setup(connectedIds: string[]) {
    const restaurantRepository: Partial<IRestaurantRepository> = {
      findWhatsappConnectedIds: jest.fn().mockResolvedValue(connectedIds),
    };
    const service = new WhatsAppConnectionService(restaurantRepository as IRestaurantRepository);
    // `connect` abre um socket real do Baileys (não roda em teste) — substituído por um espião.
    const connect = jest.spyOn(service as unknown as { connect: (id: string) => Promise<void> }, 'connect') as ConnectSpy;
    return { service, connect };
  }

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('AC-1: reabre a sessão de cada restaurante marcado como conectado', async () => {
    const { service, connect } = setup(['r-1', 'r-2']);
    connect.mockResolvedValue(undefined);

    await service.restoreConnectedSessions();

    expect(connect).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenCalledWith('r-1');
    expect(connect).toHaveBeenCalledWith('r-2');
  });

  it('AC-2: falha em um restaurante não impede os demais nem lança', async () => {
    const { service, connect } = setup(['r-1', 'r-2']);
    connect.mockRejectedValueOnce(new Error('credenciais inválidas')).mockResolvedValueOnce(undefined);

    await expect(service.restoreConnectedSessions()).resolves.toBeUndefined();

    expect(connect).toHaveBeenCalledWith('r-2');
  });
});
