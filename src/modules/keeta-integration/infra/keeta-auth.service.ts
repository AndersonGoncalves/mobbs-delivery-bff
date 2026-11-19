import { KeetaClient } from './keeta-client';
import { buildKeetaAuthorizationState } from '../domain/keeta-signature';

/** Margem de segurança antes de expirar — evita usar um token que expira no meio de uma chamada. */
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

/**
 * specs/0212-integracao-keeta — garante um `accessToken` OAuth2 válido pra uma loja já vinculada,
 * renovando sob demanda (token dura 90 dias, doc). Mesmo padrão de persistência de
 * `NinetyNineFoodAuthService` (token guardado em `Restaurant`, não num cache em memória), mas o
 * protocolo é OAuth2 padrão (`refresh_token`), não o "refresh sinaliza, busca de novo depois" da
 * 99Food.
 */
export class KeetaAuthService {
  constructor(
    private readonly client: KeetaClient,
    private readonly appId: string,
    private readonly merchantAuthorizeUrl: string,
    private readonly redirectUri: string,
  ) {}

  /** Monta a URL de autorização localmente, sem chamada de API — diferente do 99Food
   * (`Get Authorization Web Page` exige um POST pra gerar a URL). Retorna a URL e o `state`
   * novo pra o chamador persistir (`markKeetaAuthorizationPending`). */
  buildAuthorizationUrl(): { url: string; state: string } {
    const state = buildKeetaAuthorizationState();
    const url = `${this.merchantAuthorizeUrl}?responseType=authorization_code&appId=${encodeURIComponent(this.appId)}&redirectUri=${encodeURIComponent(this.redirectUri)}&scope=all&state=${encodeURIComponent(state)}`;
    return { url, state };
  }

  async exchangeAuthorizationCode(code: string): Promise<{ accessToken: string; refreshToken: string; tokenExpiresAt: string }> {
    const result = await this.client.exchangeAuthorizationCode(this.appId, code, this.redirectUri);
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      tokenExpiresAt: new Date(Date.now() + result.expiresIn * 1000).toISOString(),
    };
  }

  async getAuthorizedShops(accessToken: string): Promise<{ brandId?: string; shops: { id: string; name: string }[] }> {
    return this.client.getAuthorizedShops(this.appId, accessToken);
  }

  /** Retorna `{ accessToken, refreshed }` — `refreshed` é o novo `{ accessToken, refreshToken,
   * tokenExpiresAt }` só quando uma renovação de fato aconteceu (pra o chamador persistir, já
   * que o `refreshToken` é de uso único — o antigo para de funcionar). */
  async ensureFreshAccessToken(
    current: { accessToken: string; refreshToken: string; tokenExpiresAt?: string },
  ): Promise<{ accessToken: string; refreshed?: { accessToken: string; refreshToken: string; tokenExpiresAt: string } }> {
    const expiresAtMs = current.tokenExpiresAt ? new Date(current.tokenExpiresAt).getTime() : 0;
    if (expiresAtMs > Date.now() + EXPIRY_SAFETY_MARGIN_MS) {
      return { accessToken: current.accessToken };
    }

    const result = await this.client.refreshAccessToken(this.appId, current.refreshToken);
    const tokenExpiresAt = new Date(Date.now() + result.expiresIn * 1000).toISOString();
    return {
      accessToken: result.accessToken,
      refreshed: { accessToken: result.accessToken, refreshToken: result.refreshToken, tokenExpiresAt },
    };
  }
}
