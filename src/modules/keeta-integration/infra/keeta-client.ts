import { fetchWithTimeout } from '../../../shared/utils/fetch-with-timeout';
import { computeKeetaSignature } from '../domain/keeta-signature';
import { KeetaOrderInfo } from '../domain/keeta-order-mapper';

/**
 * specs/0212-integracao-keeta — cliente HTTP pra API da Keeta (`fetch` nativo, mesmo padrão de
 * `IFoodClient`/`NinetyNineFoodClient`: sem SDK de terceiro). Contrato capturado diretamente de
 * `api-docs.mykeeta.com` em 2026-11-19 (`plan.md`, "Resumo da API real"). Toda requisição carrega
 * `sig` (ver `computeKeetaSignature`) além do corpo/query.
 */
interface KeetaApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export class KeetaClient {
  constructor(
    private readonly baseUrl: string,
    private readonly appSecret: string,
  ) {}

  private async post<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const sig = computeKeetaSignature(url, params, this.appSecret);
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, sig }),
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw new Error(`Keeta (POST ${path}) respondeu HTTP ${response.status}: ${responseBody}`);
    }

    const result = (await response.json()) as KeetaApiResponse<T>;
    if (result.code !== 0) {
      throw new Error(`Keeta (POST ${path}) respondeu code ${result.code}: ${result.message}`);
    }
    return result.data;
  }

  /** `POST /base/oauth/token` (`grantType: "authorization_code"`) — troca o `code` do callback
   * OAuth2 pelo par de tokens da loja. `expiresIn` em segundos (90 dias / 7776000s, doc). */
  async exchangeAuthorizationCode(appId: string, code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const data = await this.post<{ access_token: string; refresh_token: string; expires_in: number }>('/base/oauth/token', {
      grantType: 'authorization_code',
      appId,
      appSecret: this.appSecret,
      code,
      redirectUri,
    });
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
  }

  /** `POST /base/oauth/token` (`grantType: "refresh_token"`) — o `refreshToken` é de uso único,
   * o valor novo substitui o antigo a cada chamada (doc). */
  async refreshAccessToken(appId: string, refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const data = await this.post<{ access_token: string; refresh_token: string; expires_in: number }>('/base/oauth/token', {
      grantType: 'refresh_token',
      appId,
      appSecret: this.appSecret,
      refreshToken,
    });
    return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in };
  }

  /** `POST /base/authorized/resource/get` — lojas vinculadas ao `accessToken` autorizado. */
  async getAuthorizedShops(appId: string, accessToken: string): Promise<{ brandId?: string; shops: { id: string; name: string }[] }> {
    const data = await this.post<{ brandId?: string; authorizedShops: { id: string; name: string }[] }>('/base/authorized/resource/get', {
      appId,
      accessToken,
    });
    return { brandId: data.brandId, shops: data.authorizedShops ?? [] };
  }

  /** `POST /order/confirm` — aceitar; prazo de 5 min após o webhook (doc). */
  async confirmOrder(accessToken: string, shopId: string, orderViewId: string): Promise<void> {
    await this.post<Record<string, never>>('/order/confirm', { accessToken, shopId, orderViewId });
  }

  /** `POST /order/cancel` — `cancelCode` enum fixo (`"500000"`-`"500003"`, só `"500000"` aceita
   * `cancelReason` livre, doc). */
  async cancelOrder(accessToken: string, shopId: string, orderViewId: string, cancelCode: string, cancelReason?: string): Promise<void> {
    await this.post<Record<string, never>>('/order/cancel', {
      accessToken,
      shopId,
      orderViewId,
      cancelCode,
      ...(cancelReason ? { cancelReason } : {}),
    });
  }

  /** `POST /order/prepare` — marca "pronto pra retirada" (`userGetMode === 'pickup'`), REQ-8. */
  async markReadyForPickup(accessToken: string, shopId: string, orderViewId: string): Promise<void> {
    await this.post<Record<string, never>>('/order/prepare', { accessToken, shopId, orderViewId });
  }

  /** `POST /order/get` — detalhe sob demanda (ex.: confirmar `feeDtl.merchantFee` completo). */
  async getOrder(accessToken: string, shopId: string, orderViewId: string): Promise<KeetaOrderInfo> {
    return this.post<KeetaOrderInfo>('/order/get', { accessToken, shopId, orderViewId });
  }
}
