/**
 * specs/0121-integracao-uber-entregas — autenticação OAuth2 client-credentials contra a Uber
 * Direct (`developer.uber.com`, confirmado em 2026-10-29): `POST https://auth.uber.com/oauth/v2/
 * token`, `application/x-www-form-urlencoded`, campos `client_id`/`client_secret`/
 * `grant_type=client_credentials`/`scope=eats.deliveries`. Mesmo padrão de cache em memória de
 * `IFoodAuthService` (specs/0090): cacheia por `clientId`, renova alguns segundos antes de expirar.
 */
interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const EXPIRY_SAFETY_MARGIN_MS = 30_000;
const UBER_OAUTH_URL = 'https://auth.uber.com/oauth/v2/token';

export class UberDirectAuthService {
  private readonly cache = new Map<string, CachedToken>();

  async getAccessToken(clientId: string, clientSecret: string): Promise<string> {
    const cached = this.cache.get(clientId);
    if (cached && cached.expiresAt > Date.now() + EXPIRY_SAFETY_MARGIN_MS) {
      return cached.accessToken;
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope: 'eats.deliveries',
    });

    const response = await fetch(UBER_OAUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw new Error(`Uber Direct OAuth (POST /oauth/v2/token) respondeu ${response.status}: ${responseBody}`);
    }

    const result = (await response.json()) as { access_token: string; expires_in: number };
    this.cache.set(clientId, {
      accessToken: result.access_token,
      expiresAt: Date.now() + result.expires_in * 1000,
    });
    return result.access_token;
  }
}
