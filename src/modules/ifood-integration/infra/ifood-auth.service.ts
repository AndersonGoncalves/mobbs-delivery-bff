/**
 * specs/0090-integracao-ifood REQ-1 — autenticação OAuth2 client credentials contra a API do
 * iFood (Portal do Parceiro / iFood for Developers), `POST /authentication/v1.0/oauth/token`
 * (`grant_type=client_credentials`, corpo `application/x-www-form-urlencoded`), contrato
 * documentado publicamente em developer.ifood.com.br. Cacheia o token EM MEMÓRIA por
 * `clientId` (processo único do BFF, mesmo raciocínio de `WhatsAppConnectionService` guardando
 * sessão em memória) e renova automaticamente alguns segundos antes de expirar, nunca exigindo
 * reconexão manual (AC-1).
 */
interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/** Margem de segurança antes de expirar — evita usar um token que expira no meio de uma chamada. */
const EXPIRY_SAFETY_MARGIN_MS = 30_000;

export class IFoodAuthService {
  private readonly cache = new Map<string, CachedToken>();

  constructor(private readonly baseUrl: string) {}

  async getAccessToken(clientId: string, clientSecret: string): Promise<string> {
    const cached = this.cache.get(clientId);
    if (cached && cached.expiresAt > Date.now() + EXPIRY_SAFETY_MARGIN_MS) {
      return cached.accessToken;
    }

    const body = new URLSearchParams({
      grantType: 'client_credentials',
      clientId,
      clientSecret,
    });

    const response = await fetch(`${this.baseUrl}/authentication/v1.0/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw new Error(`iFood OAuth (POST /authentication/v1.0/oauth/token) respondeu ${response.status}: ${responseBody}`);
    }

    const result = (await response.json()) as { accessToken: string; expiresIn: number };
    this.cache.set(clientId, {
      accessToken: result.accessToken,
      expiresAt: Date.now() + result.expiresIn * 1000,
    });
    return result.accessToken;
  }
}
