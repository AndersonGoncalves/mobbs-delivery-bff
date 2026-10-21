/**
 * specs/0101-integracao-asaas (fase 1, só Pix) — cliente HTTP pro Asaas, `fetch` nativo (mesmo
 * padrão de `GooglePlacesService`, sem SDK/axios). Contrato conferido na documentação oficial
 * (docs.asaas.com) em 2026-10-21: base URL por ambiente, chave no header `access_token` (não
 * `Authorization: Bearer`).
 *
 * Instanciado com duas chaves diferentes dependendo da operação:
 * - A chave da conta MÃE/plataforma (`environment.asaas.apiKey`) — só pra criar subcontas
 *   (`createSubaccount`).
 * - A chave da PRÓPRIA subconta de um restaurante (`Restaurant.asaasApiKey`, devolvida uma única
 *   vez na criação) — pra tudo o resto (cliente, cobrança, QR code, estorno), em nome daquele
 *   restaurante especificamente.
 */

export interface AsaasSubaccountInput {
  name: string;
  email: string;
  cpfCnpj: string;
  mobilePhone: string;
  incomeValue: number;
  address: string;
  addressNumber: string;
  province: string;
  postalCode: string;
  companyType?: 'MEI' | 'LIMITED' | 'INDIVIDUAL' | 'ASSOCIATION';
}

export interface AsaasSubaccountResult {
  id: string;
  walletId: string;
  apiKey: string;
}

export interface AsaasCustomerResult {
  id: string;
}

export interface AsaasPixChargeResult {
  id: string;
  status: string;
}

export interface AsaasPixQrCodeResult {
  payload: string;
}

export class AsaasClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', access_token: this.apiKey },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw new Error(`Asaas API (${method} ${path}) respondeu ${response.status}: ${responseBody}`);
    }

    return (await response.json()) as T;
  }

  /** `POST /v3/accounts` — chamado com a chave da conta MÃE. `webhookUrl`/`webhookToken`
   * registram o webhook de confirmação de pagamento já na criação da subconta (a API do Asaas
   * aceita isso num só payload — não precisa de uma 2ª chamada). */
  async createSubaccount(input: AsaasSubaccountInput, webhookUrl: string, webhookToken: string): Promise<AsaasSubaccountResult> {
    const result = await this.request<{ id: string; walletId: string; accessToken: { apiKey: string } }>('POST', '/accounts', {
      ...input,
      webhooks: [
        {
          name: 'Confirmação de pagamento (mobbs)',
          url: webhookUrl,
          email: input.email,
          interrupted: false,
          enabled: true,
          events: ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'],
          sendType: 'NON_SEQUENTIALLY',
          authToken: webhookToken,
        },
      ],
    });
    return { id: result.id, walletId: result.walletId, apiKey: result.accessToken.apiKey };
  }

  /** `POST /v3/customers` — `name`/`cpfCnpj` são os únicos campos obrigatórios. */
  async createCustomer(name: string, cpfCnpj: string): Promise<AsaasCustomerResult> {
    const result = await this.request<{ id: string }>('POST', '/customers', { name, cpfCnpj });
    return { id: result.id };
  }

  /** `POST /v3/payments` — `externalReference` é o NOSSO id de pedido; o webhook devolve esse
   * mesmo valor, o que evita ter que resolver o pedido por `id` da cobrança do Asaas. */
  async createPixCharge(customerId: string, value: number, dueDate: string, externalReference: string): Promise<AsaasPixChargeResult> {
    const result = await this.request<{ id: string; status: string }>('POST', '/payments', {
      customer: customerId,
      billingType: 'PIX',
      value,
      dueDate,
      externalReference,
    });
    return { id: result.id, status: result.status };
  }

  /** `GET /v3/payments/:id/pixQrCode` — só `payload` (copia-e-cola) importa aqui: o app já
   * desenha o próprio QR a partir da string, igual já faz com o Pix local. */
  async getPixQrCode(chargeId: string): Promise<AsaasPixQrCodeResult> {
    const result = await this.request<{ payload: string }>('GET', `/payments/${chargeId}/pixQrCode`);
    return { payload: result.payload };
  }

  /** `POST /v3/payments/:id/refund` — sem corpo = estorno total (único caso usado na fase 1). */
  async refundCharge(chargeId: string): Promise<void> {
    await this.request('POST', `/payments/${chargeId}/refund`, {});
  }
}
