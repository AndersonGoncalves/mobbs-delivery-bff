/**
 * specs/0122-integracao-99food — cliente HTTP pra API do 99Food Open Platform (`fetch` nativo,
 * mesmo padrão de `IFoodClient`/`UberDirectClient`: sem SDK de terceiro). Contrato capturado
 * diretamente do portal público em 2026-10-29 (`plan.md`, "Resumo da API real").
 *
 * Diferente do iFood (OAuth2 client credentials): aqui `app_id`/`app_secret` são credenciais de
 * NÍVEL DE APP (plataforma mobbs, não por restaurante) e `auth_token` é por loja. Nenhum desses
 * 4 endpoints de autorização exige assinatura HMAC extra — só os campos no corpo/query, plano
 * (diferente do endpoint em lote `Bind Store`, fora de escopo aqui). `confirmOrder`/`cancelOrder`
 * usam só `auth_token` + `order_id` (strings sempre — inteiro de 64 bits, nunca `number`).
 */
interface NinetyNineFoodApiResponse<T> {
  errno: number;
  errmsg: string;
  data: T;
}

export class NinetyNineFoodClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(method: string, path: string, params: Record<string, string>): Promise<T> {
    let response: Response;
    if (method === 'GET') {
      const query = new URLSearchParams(params).toString();
      response = await fetch(`${this.baseUrl}${path}?${query}`, { method: 'GET' });
    } else {
      response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
    }

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw new Error(`99Food (${method} ${path}) respondeu HTTP ${response.status}: ${responseBody}`);
    }

    const result = (await response.json()) as NinetyNineFoodApiResponse<T>;
    if (result.errno !== 0) {
      throw new Error(`99Food (${method} ${path}) respondeu errno ${result.errno}: ${result.errmsg}`);
    }
    return result.data;
  }

  /** `POST /v1/auth/authorizationpage/getUrl` — URL do fluxo self-service de autorização
   * (válida por 7 dias), REQ-1. */
  async getAuthorizationUrl(appId: string): Promise<string> {
    const data = await this.request<{ url: string }>('POST', '/v1/auth/authorizationpage/getUrl', { app_id: appId });
    return data.url;
  }

  /** `GET /v1/auth/authtoken/get` — `auth_token` + expiração de uma loja já vinculada
   * (`app_shop_id` gerado pela própria 99Food no fluxo self-service), REQ-2. */
  async getAuthtoken(appId: string, appSecret: string, appShopId: string): Promise<{ authToken: string; tokenExpirationTime: number }> {
    const data = await this.request<{ auth_token: string; token_expiration_time: number }>('GET', '/v1/auth/authtoken/get', {
      app_id: appId,
      app_secret: appSecret,
      app_shop_id: appShopId,
    });
    return { authToken: data.auth_token, tokenExpirationTime: data.token_expiration_time };
  }

  /** `GET /v1/auth/authtoken/refresh` — só sinaliza a renovação; o valor novo só vem chamando
   * `getAuthtoken` de novo depois (doc oficial). Cooldown de 2 minutos entre chamadas. */
  async refreshAuthtoken(appId: string, appSecret: string, appShopId: string): Promise<void> {
    await this.request<boolean>('GET', '/v1/auth/authtoken/refresh', {
      app_id: appId,
      app_secret: appSecret,
      app_shop_id: appShopId,
    });
  }

  /** `POST /v1/order/order/confirm` — REQ-5. Precisa ser chamado em até 5 minutos do `orderNew`,
   * senão a 99Food cancela automaticamente. */
  async confirmOrder(authToken: string, orderId: string): Promise<void> {
    await this.request<boolean>('POST', '/v1/order/order/confirm', { auth_token: authToken, order_id: orderId });
  }

  /** `POST /v1/order/order/cancel` — REQ-5. `reasonId` segue a lista fixa da 99Food
   * (`plan.md`); `1080` ("Other reason") exige `reason` preenchido. */
  async cancelOrder(authToken: string, orderId: string, reasonId: number, reason?: string): Promise<void> {
    await this.request<boolean>('POST', '/v1/order/order/cancel', {
      auth_token: authToken,
      order_id: orderId,
      reason_id: String(reasonId),
      ...(reason ? { reason } : {}),
    });
  }
}
