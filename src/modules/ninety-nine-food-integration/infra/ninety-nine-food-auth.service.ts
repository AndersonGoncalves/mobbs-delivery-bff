import { NinetyNineFoodClient } from './ninety-nine-food-client';

/** Margem de segurança antes de expirar — evita usar um token que expira no meio de uma chamada. */
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

/**
 * specs/0122-integracao-99food — garante um `auth_token` válido pra uma loja já vinculada,
 * renovando sob demanda. Diferente de `IFoodAuthService` (cache em memória, token sempre
 * re-obtido do zero): aqui o token é persistido em `Restaurant` (mesmo padrão de
 * `ifoodClientSecret`/`mercadoPagoAccessToken`), então a orquestração de renovação olha pro
 * registro já salvo em vez de um cache próprio.
 */
export class NinetyNineFoodAuthService {
  constructor(
    private readonly client: NinetyNineFoodClient,
    private readonly appId: string,
    private readonly appSecret: string,
  ) {}

  /** Retorna `{ authToken, refreshed }` — `refreshed` é o novo `{ authToken,
   * tokenExpiresAt }` só quando uma renovação de fato aconteceu (pra o chamador persistir). */
  async ensureFreshAuthToken(
    appShopId: string,
    current: { authToken: string; tokenExpiresAt?: string },
  ): Promise<{ authToken: string; refreshed?: { authToken: string; tokenExpiresAt: string } }> {
    const expiresAtMs = current.tokenExpiresAt ? new Date(current.tokenExpiresAt).getTime() : 0;
    if (expiresAtMs > Date.now() + EXPIRY_SAFETY_MARGIN_MS) {
      return { authToken: current.authToken };
    }

    // Doc oficial: `refresh` só sinaliza a renovação — o valor novo vem chamando `getAuthtoken`
    // de novo depois.
    await this.client.refreshAuthtoken(this.appId, this.appSecret, appShopId);
    const result = await this.client.getAuthtoken(this.appId, this.appSecret, appShopId);
    const tokenExpiresAt = new Date(result.tokenExpirationTime * 1000).toISOString();
    return { authToken: result.authToken, refreshed: { authToken: result.authToken, tokenExpiresAt } };
  }

  async getAuthorizationUrl(): Promise<string> {
    return this.client.getAuthorizationUrl(this.appId);
  }

  async getAuthtokenForNewBinding(appShopId: string): Promise<{ authToken: string; tokenExpiresAt: string }> {
    const result = await this.client.getAuthtoken(this.appId, this.appSecret, appShopId);
    return { authToken: result.authToken, tokenExpiresAt: new Date(result.tokenExpirationTime * 1000).toISOString() };
  }
}
