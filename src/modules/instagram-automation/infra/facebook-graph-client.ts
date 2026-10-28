/**
 * Pedido explícito do usuário (follow-up) — cliente HTTP pra Graph API do Facebook/Instagram,
 * `fetch` nativo (mesmo padrão de `MercadoPagoClient`/`AsaasClient`, sem SDK). Contrato conferido
 * na documentação oficial (developers.facebook.com/docs/instagram-platform) em 2026-10-27.
 *
 * Modelo OAuth "Facebook Login for Business": o restaurante autoriza ESTA aplicação a enxergar as
 * Páginas dele; cada Página pode ter uma conta Instagram Business vinculada (feito pelo próprio
 * dono da Página no app do Instagram, fora do nosso controle) — é essa conta que publica. A
 * publicação em si usa o ACCESS TOKEN DA PÁGINA (não o token de usuário do OAuth inicial), obtido
 * em `resolveInstagramBusinessAccount` a partir do token de usuário de longa duração.
 */

export interface FacebookTokenResult {
  accessToken: string;
  expiresIn?: number;
}

export interface InstagramBusinessAccount {
  pageId: string;
  pageAccessToken: string;
  instagramAccountId: string;
  instagramUsername?: string;
}

export class FacebookGraphClient {
  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly graphBaseUrl: string,
  ) {}

  /** O restaurante abre essa URL (via web, não WebView) e, se concordar, o Facebook redireciona
   * pra `redirectUri` com `?code=...&state=...`. `state` é um nonce da retaguarda pra validação
   * CSRF (não guardado aqui, mesmo padrão de `MercadoPagoClient.getAuthorizationUrl`). Escopos
   * mínimos pra ler Páginas + publicar no Instagram vinculado. */
  getAuthorizationUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: redirectUri,
      state,
      scope: 'pages_show_list,pages_read_engagement,instagram_basic,instagram_content_publish,business_management',
      response_type: 'code',
    });
    return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
  }

  /** Troca o `code` do callback por um token de usuário de curta duração (1h, grant_type
   * implícito via `redirect_uri`/`code` na própria Graph API — diferente do MP, não é
   * `POST /oauth/token`, é `GET /oauth/access_token`). */
  async exchangeCodeForToken(code: string, redirectUri: string): Promise<FacebookTokenResult> {
    const params = new URLSearchParams({ client_id: this.appId, client_secret: this.appSecret, redirect_uri: redirectUri, code });
    const result = await this.get<{ access_token: string; expires_in?: number }>(`/oauth/access_token?${params.toString()}`);
    return { accessToken: result.access_token, expiresIn: result.expires_in };
  }

  /** Troca o token de curta duração (1h) por um de longa duração (~60 dias) — mesma chamada
   * usada depois pra resolver o token da Página, que herda a duração do token de usuário que o
   * gerou. */
  async getLongLivedToken(shortLivedToken: string): Promise<FacebookTokenResult> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.appId,
      client_secret: this.appSecret,
      fb_exchange_token: shortLivedToken,
    });
    const result = await this.get<{ access_token: string; expires_in?: number }>(`/oauth/access_token?${params.toString()}`);
    return { accessToken: result.access_token, expiresIn: result.expires_in };
  }

  /** `GET /me/accounts` lista as Páginas que o usuário administra (com o access token PRÓPRIO DE
   * CADA PÁGINA já incluso na resposta); pra cada uma, `GET /{page-id}?fields=instagram_business_account`
   * resolve se tem conta Instagram Business vinculada. Primeira Página com vínculo encontrado
   * vence — restaurante com mais de uma Página/conta precisa resolver isso manualmente por fora
   * (fora de escopo desta v1, mesmo nível de simplicidade do Mercado Pago/Asaas: um vínculo só por
   * restaurante). `null` quando nenhuma Página tem Instagram Business vinculado. */
  async resolveInstagramBusinessAccount(userAccessToken: string): Promise<InstagramBusinessAccount | null> {
    const pages = await this.get<{ data: Array<{ id: string; access_token: string }> }>(
      `/me/accounts?access_token=${encodeURIComponent(userAccessToken)}`,
    );
    for (const page of pages.data) {
      const details = await this.get<{ instagram_business_account?: { id: string; username?: string } }>(
        `/${page.id}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(page.access_token)}`,
      );
      if (details.instagram_business_account) {
        return {
          pageId: page.id,
          pageAccessToken: page.access_token,
          instagramAccountId: details.instagram_business_account.id,
          instagramUsername: details.instagram_business_account.username,
        };
      }
    }
    return null;
  }

  /** `POST /{ig-user-id}/media` — cria o container de mídia (a Graph API busca `imageUrl`
   * sozinha, precisa ser pública/HTTPS). Devolve só o `id` do container; publicar de verdade é
   * `publishMedia` (passo separado, pode falhar independente — ex. processamento da imagem). */
  async createMediaContainer(pageAccessToken: string, instagramAccountId: string, imageUrl: string, caption: string): Promise<string> {
    const result = await this.post<{ id: string }>(`/${instagramAccountId}/media`, {
      image_url: imageUrl,
      caption,
      access_token: pageAccessToken,
    });
    return result.id;
  }

  /** `POST /{ig-user-id}/media_publish` — publica o container já criado. */
  async publishMedia(pageAccessToken: string, instagramAccountId: string, creationId: string): Promise<string> {
    const result = await this.post<{ id: string }>(`/${instagramAccountId}/media_publish`, {
      creation_id: creationId,
      access_token: pageAccessToken,
    });
    return result.id;
  }

  private async get<T>(path: string): Promise<T> {
    const response = await fetch(`${this.graphBaseUrl}${path}`);
    return this.parse<T>(response, 'GET', path);
  }

  private async post<T>(path: string, body: Record<string, string>): Promise<T> {
    const response = await fetch(`${this.graphBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
    return this.parse<T>(response, 'POST', path);
  }

  private async parse<T>(response: Response, method: string, path: string): Promise<T> {
    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw new Error(`Facebook Graph API (${method} ${path}) respondeu ${response.status}: ${responseBody}`);
    }
    return (await response.json()) as T;
  }
}
