import { fetchWithTimeout } from '../../../shared/utils/fetch-with-timeout';

/**
 * specs/0170-integracao-mercado-pago — cliente HTTP pro Mercado Pago, `fetch` nativo (mesmo
 * padrão de `AsaasClient`/`GooglePlacesService`, sem SDK/axios). Contrato conferido na
 * documentação oficial (mercadopago.com.br/developers) em 2026-10-21.
 *
 * Diferente do Asaas (subconta/KYC criada por nós), o modelo aqui é OAuth: cada restaurante
 * autoriza A NOSSA aplicação a operar em nome da conta Mercado Pago que ele já tem. Por isso
 * praticamente todo método abaixo recebe o `accessToken` DO RESTAURANTE (exceto
 * `getAuthorizationUrl`/`exchangeCodeForToken`/`refreshAccessToken`, que usam as credenciais da
 * aplicação — `clientId`/`clientSecret` — e `getPayment`, chamado no momento do webhook com o
 * token da APLICAÇÃO porque ainda não sabemos de qual restaurante é o pagamento).
 */

export interface MercadoPagoTokenResult {
  accessToken: string;
  refreshToken: string;
  userId: string;
  expiresIn: number;
}

export interface MercadoPagoPreferenceInput {
  orderId: string;
  items: Array<{ title: string; quantity: number; unitPrice: number }>;
  notificationUrl: string;
  backUrls: { success: string; failure: string; pending: string };
}

export interface MercadoPagoPreferenceResult {
  id: string;
  initPoint: string;
}

export interface MercadoPagoPaymentResult {
  /** specs/0226 REQ-A3 — id do PAGAMENTO no Mercado Pago (diferente do id da preferência); é o
   * que o estorno (`refundPayment`) espera. */
  id: string;
  status: string;
  externalReference: string;
}

export class MercadoPagoClient {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly baseUrl: string,
  ) {}

  private async request<T>(method: string, path: string, accessToken: string, body?: unknown): Promise<T> {
    const response = await fetchWithTimeout(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw new Error(`Mercado Pago API (${method} ${path}) respondeu ${response.status}: ${responseBody}`);
    }

    return (await response.json()) as T;
  }

  /** Monta a URL de autorização OAuth — o restaurante abre essa URL (via web, não WebView) e,
   * se concordar, o Mercado Pago redireciona pra `redirectUri` com `?code=...&state=...`.
   * `state` é um nonce gerado pela retaguarda pra validação CSRF (não guardado aqui). */
  getAuthorizationUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      response_type: 'code',
      platform_id: 'mp',
      state,
      redirect_uri: redirectUri,
    });
    return `https://auth.mercadopago.com/authorization?${params.toString()}`;
  }

  /** `POST /oauth/token` com `grant_type: authorization_code` — troca o `code` do callback pelo
   * par de tokens do restaurante. `access_token` vale 180 dias (`expiresIn` em segundos). */
  async exchangeCodeForToken(code: string, redirectUri: string, codeVerifier?: string): Promise<MercadoPagoTokenResult> {
    const result = await this.requestWithoutAuth<{ access_token: string; refresh_token: string; user_id: number; expires_in: number }>('/oauth/token', {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    });
    return { accessToken: result.access_token, refreshToken: result.refresh_token, userId: String(result.user_id), expiresIn: result.expires_in };
  }

  /** `POST /oauth/token` com `grant_type: refresh_token` — disponível pra quando o
   * `access_token` (180 dias) expirar; não chamado automaticamente nesta fase (fora de escopo
   * da spec 0170, ver "Fora de escopo"). */
  async refreshAccessToken(refreshToken: string): Promise<MercadoPagoTokenResult> {
    const result = await this.requestWithoutAuth<{ access_token: string; refresh_token: string; user_id: number; expires_in: number }>('/oauth/token', {
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    return { accessToken: result.access_token, refreshToken: result.refresh_token, userId: String(result.user_id), expiresIn: result.expires_in };
  }

  private async requestWithoutAuth<T>(path: string, body: unknown): Promise<T> {
    const response = await fetchWithTimeout(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw new Error(`Mercado Pago API (POST ${path}) respondeu ${response.status}: ${responseBody}`);
    }

    return (await response.json()) as T;
  }

  /** `POST /checkout/preferences` com o `accessToken` DO RESTAURANTE — a cobrança é feita em
   * nome da conta Mercado Pago dele, não da nossa. `external_reference` é o NOSSO id de pedido;
   * o webhook (via `getPayment`) devolve esse mesmo valor. `auto_return: 'all'` volta pro app
   * automaticamente após o pagamento (sucesso ou falha). */
  async createPreference(accessToken: string, input: MercadoPagoPreferenceInput): Promise<MercadoPagoPreferenceResult> {
    const result = await this.request<{ id: string; init_point: string }>('POST', '/checkout/preferences', accessToken, {
      items: input.items.map((item) => ({ title: item.title, quantity: item.quantity, unit_price: item.unitPrice, currency_id: 'BRL' })),
      external_reference: input.orderId,
      notification_url: input.notificationUrl,
      back_urls: { success: input.backUrls.success, failure: input.backUrls.failure, pending: input.backUrls.pending },
      auto_return: 'all',
      // specs/0226 REQ-A2 — checkout de CARTÃO: sem Pix (`bank_transfer`) nem boleto (`ticket`).
      // Antes nada era excluído e o cliente podia pagar com Pix lá dentro — o pedido era
      // confirmado e lançado no caixa como "cartão online".
      payment_methods: { excluded_payment_types: [{ id: 'bank_transfer' }, { id: 'ticket' }] },
    });
    return { id: result.id, initPoint: result.init_point };
  }

  /** `GET /v1/payments/:id` — chamado na recepção do webhook com o `accessToken` DO RESTAURANTE
   * dono do pagamento (specs/0226 REQ-A4: o restaurante é achado pelo `user_id` do aviso; antes
   * usava o token da aplicação, que pode não enxergar pagamento de outra conta). */
  async getPayment(accessToken: string, paymentId: string): Promise<MercadoPagoPaymentResult> {
    const result = await this.request<{ id: number | string; status: string; external_reference: string }>('GET', `/v1/payments/${paymentId}`, accessToken);
    return { id: String(result.id), status: result.status, externalReference: result.external_reference };
  }

  /** `POST /v1/payments/:id/refunds` com o `accessToken` DO RESTAURANTE — sem corpo = estorno
   * total (único caso usado nesta fase, mesmo padrão do `AsaasClient.refundCharge`). */
  async refundPayment(accessToken: string, paymentId: string): Promise<void> {
    await this.request('POST', `/v1/payments/${paymentId}/refunds`, accessToken, {});
  }
}
