import { KeetaAuthService } from './keeta-auth.service';
import { KeetaClient } from './keeta-client';

jest.mock('./keeta-client');

describe('KeetaAuthService (specs/0212-integracao-keeta)', () => {
  function setup() {
    const client = new KeetaClient('https://open.mykeeta.com', 'segredo') as jest.Mocked<KeetaClient>;
    const service = new KeetaAuthService(client, 'app-1', 'https://merchant.mykeeta.com/m/web/openapi/authorize', 'https://api.bsdelivery.com.br/webhooks/keeta/oauth-callback');
    return { client, service };
  }

  it('buildAuthorizationUrl monta a URL localmente, sem chamar a API, com appId/redirectUri/state', () => {
    const { service, client } = setup();

    const { url, state } = service.buildAuthorizationUrl();

    expect(url).toContain('https://merchant.mykeeta.com/m/web/openapi/authorize?responseType=authorization_code');
    expect(url).toContain('appId=app-1');
    expect(url).toContain(encodeURIComponent('https://api.bsdelivery.com.br/webhooks/keeta/oauth-callback'));
    expect(url).toContain(`state=${state}`);
    expect(client.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it('exchangeAuthorizationCode delega pro client e converte expiresIn em ISO', async () => {
    const { service, client } = setup();
    client.exchangeAuthorizationCode = jest.fn().mockResolvedValue({ accessToken: 'tok-1', refreshToken: 'ref-1', expiresIn: 7776000 });

    const result = await service.exchangeAuthorizationCode('code-xyz');

    expect(client.exchangeAuthorizationCode).toHaveBeenCalledWith('app-1', 'code-xyz', 'https://api.bsdelivery.com.br/webhooks/keeta/oauth-callback');
    expect(result.accessToken).toBe('tok-1');
    expect(result.refreshToken).toBe('ref-1');
    expect(new Date(result.tokenExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  describe('ensureFreshAccessToken', () => {
    it('reaproveita o token atual se ainda não está perto de expirar', async () => {
      const { service, client } = setup();
      const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();

      const result = await service.ensureFreshAccessToken({ accessToken: 'tok-atual', refreshToken: 'ref-atual', tokenExpiresAt: future });

      expect(result).toEqual({ accessToken: 'tok-atual' });
      expect(client.refreshAccessToken).not.toHaveBeenCalled();
    });

    it('renova quando o token está perto de expirar (ou ausente), devolvendo o novo par pro chamador persistir', async () => {
      const { service, client } = setup();
      client.refreshAccessToken = jest.fn().mockResolvedValue({ accessToken: 'tok-novo', refreshToken: 'ref-novo', expiresIn: 7776000 });
      const past = new Date(Date.now() - 1000).toISOString();

      const result = await service.ensureFreshAccessToken({ accessToken: 'tok-velho', refreshToken: 'ref-velho', tokenExpiresAt: past });

      expect(client.refreshAccessToken).toHaveBeenCalledWith('app-1', 'ref-velho');
      expect(result.accessToken).toBe('tok-novo');
      expect(result.refreshed?.accessToken).toBe('tok-novo');
      expect(result.refreshed?.refreshToken).toBe('ref-novo');
    });
  });
});
