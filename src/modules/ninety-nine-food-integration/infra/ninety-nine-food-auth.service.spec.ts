import { NinetyNineFoodAuthService } from './ninety-nine-food-auth.service';
import { NinetyNineFoodClient } from './ninety-nine-food-client';

jest.mock('./ninety-nine-food-client');

describe('NinetyNineFoodAuthService (specs/0122-integracao-99food)', () => {
  let client: jest.Mocked<NinetyNineFoodClient>;
  let service: NinetyNineFoodAuthService;

  beforeEach(() => {
    client = new NinetyNineFoodClient('https://openapi.99food.com') as jest.Mocked<NinetyNineFoodClient>;
    service = new NinetyNineFoodAuthService(client, 'app-1', 'secret-1');
  });

  it('ensureFreshAuthToken: token ainda válido não chama a API', async () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const result = await service.ensureFreshAuthToken('shop-1', { authToken: 'token-atual', tokenExpiresAt: future });

    expect(result).toEqual({ authToken: 'token-atual' });
    expect(client.refreshAuthtoken).not.toHaveBeenCalled();
    expect(client.getAuthtoken).not.toHaveBeenCalled();
  });

  it('ensureFreshAuthToken: token expirado chama refresh + getAuthtoken e devolve o novo valor', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    client.refreshAuthtoken.mockResolvedValue(undefined);
    client.getAuthtoken.mockResolvedValue({ authToken: 'token-novo', tokenExpirationTime: 1700000000 });

    const result = await service.ensureFreshAuthToken('shop-1', { authToken: 'token-velho', tokenExpiresAt: past });

    expect(client.refreshAuthtoken).toHaveBeenCalledWith('app-1', 'secret-1', 'shop-1');
    expect(client.getAuthtoken).toHaveBeenCalledWith('app-1', 'secret-1', 'shop-1');
    expect(result.authToken).toBe('token-novo');
    expect(result.refreshed).toEqual({ authToken: 'token-novo', tokenExpiresAt: new Date(1700000000 * 1000).toISOString() });
  });

  it('ensureFreshAuthToken: sem tokenExpiresAt (nunca vinculado de verdade) renova também', async () => {
    client.refreshAuthtoken.mockResolvedValue(undefined);
    client.getAuthtoken.mockResolvedValue({ authToken: 'token-novo', tokenExpirationTime: 1700000000 });

    const result = await service.ensureFreshAuthToken('shop-1', { authToken: 'token-velho' });

    expect(result.refreshed).toBeDefined();
  });

  it('getAuthorizationUrl delega pro client com o app_id configurado', async () => {
    client.getAuthorizationUrl.mockResolvedValue('https://merchant.99app.com/authorize?x=1');

    const url = await service.getAuthorizationUrl();

    expect(client.getAuthorizationUrl).toHaveBeenCalledWith('app-1');
    expect(url).toBe('https://merchant.99app.com/authorize?x=1');
  });

  it('getAuthtokenForNewBinding delega pro client e converte o timestamp', async () => {
    client.getAuthtoken.mockResolvedValue({ authToken: 'token-novo', tokenExpirationTime: 1700000000 });

    const result = await service.getAuthtokenForNewBinding('shop-1');

    expect(client.getAuthtoken).toHaveBeenCalledWith('app-1', 'secret-1', 'shop-1');
    expect(result).toEqual({ authToken: 'token-novo', tokenExpiresAt: new Date(1700000000 * 1000).toISOString() });
  });
});
