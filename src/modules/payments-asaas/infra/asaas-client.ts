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
  // Achado real (pedido explícito do usuário) — exigido pelo Asaas quando o titular da subconta
  // é pessoa física (docs.asaas.com/docs/criacao-de-subcontas); este fluxo nunca expõe
  // `companyType` pro operador escolher, então é implicitamente sempre pessoa física.
  birthDate: string;
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

/** specs/0101-integracao-asaas (fase 2) — checkout hospedado do Asaas: o cartão é digitado numa
 * página deles (`link`), nunca no nosso backend/app — satisfaz REQ-3 ao pé da letra. */
export interface AsaasCheckoutInput {
  items: { name: string; quantity: number; value: number }[];
  externalReference: string;
  successUrl: string;
  cancelUrl: string;
  expiredUrl?: string;
  /** 10 a 1440 (máx. 24h); default 60 — tempo de sobra pro cliente terminar o pagamento na hora. */
  minutesToExpire?: number;
}

export interface AsaasCheckoutResult {
  id: string;
  /** URL pronta pra redirecionar/abrir numa WebView — não precisa montar a partir do `id`. */
  link: string;
}

/** specs/0175-cobranca-assinatura-asaas — status real de um pagamento específico (reconciliação
 * da assinatura da plataforma, por id direto — diferente de `findPaymentByExternalReference`,
 * que busca por referência quando ainda não se sabe o id). `status` é um dos 14 valores
 * documentados (`PENDING`/`RECEIVED`/`CONFIRMED`/`OVERDUE`/`REFUNDED`/etc., verificado em
 * docs.asaas.com/reference/recuperar-uma-unica-cobranca, 2026-10-27). */
export interface AsaasPaymentResult {
  id: string;
  status: string;
}

export interface AsaasBalanceResult {
  balance: number;
}

export interface AsaasTransferResult {
  id: string;
  status: string;
  value: number;
  netValue: number;
  transferFee: number;
  dateCreated: string;
  effectiveDate?: string;
  description?: string;
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

  /** `POST /v3/checkouts` (fase 2) — `billingTypes: ['CREDIT_CARD']`/`chargeTypes: ['DETACHED']`
   * fixos (cobrança avulsa só de cartão; Pix continua pelo fluxo dedicado acima). `callback` só
   * controla o redirecionamento do navegador/WebView — nunca confirma pagamento (REQ-4/REQ-5),
   * quem confirma é sempre o webhook (`CHECKOUT_PAID`, ver `AsaasWebhookController`). */
  async createCheckout(input: AsaasCheckoutInput): Promise<AsaasCheckoutResult> {
    const result = await this.request<{ id: string; link: string }>('POST', '/checkouts', {
      billingTypes: ['CREDIT_CARD'],
      chargeTypes: ['DETACHED'],
      items: input.items,
      externalReference: input.externalReference,
      callback: { successUrl: input.successUrl, cancelUrl: input.cancelUrl, expiredUrl: input.expiredUrl },
      minutesToExpire: input.minutesToExpire ?? 60,
    });
    return { id: result.id, link: result.link };
  }

  /** `GET /v3/payments?externalReference=X` (fase 2) — resolve o pagamento REAL criado por um
   * checkout pago: o `id` do checkout em si não é um pagamento, `POST /v3/payments/:id/refund`
   * precisa do id do pagamento, não do checkout. `externalReference` é o nosso id de pedido,
   * mesmo valor setado na criação do checkout (`createCheckout`). */
  async findPaymentByExternalReference(externalReference: string): Promise<{ id: string } | null> {
    const result = await this.request<{ data: { id: string }[] }>(
      'GET',
      `/payments?externalReference=${encodeURIComponent(externalReference)}`,
    );
    return result.data[0] ?? null;
  }

  /** `POST /v3/webhooks` (fase 2) — webhook ADICIONAL (uma conta aceita até 10), só pros eventos
   * de checkout; nunca mexe no webhook de Pix já criado em `createSubaccount` (zero risco pro que
   * já está em produção desde a fase 1). Registrado sob demanda, uma vez por restaurante (ver
   * `Restaurant.asaasCheckoutWebhookRegistered`). */
  async createCheckoutWebhook(webhookUrl: string, webhookToken: string, notifyEmail: string): Promise<void> {
    await this.request('POST', '/webhooks', {
      name: 'Checkout de cartão (mobbs)',
      url: webhookUrl,
      email: notifyEmail,
      interrupted: false,
      enabled: true,
      events: ['CHECKOUT_PAID', 'CHECKOUT_CANCELED', 'CHECKOUT_EXPIRED'],
      sendType: 'NON_SEQUENTIALLY',
      authToken: webhookToken,
    });
  }

  /** `GET /v3/payments/:id` (specs/0175-cobranca-assinatura-asaas) — status real de uma cobrança
   * específica, pra reconciliação (`ReconciliationService`): webhook perdido/atrasado,
   * pagamento durante indisponibilidade, estorno total/parcial. */
  async getPayment(chargeId: string): Promise<AsaasPaymentResult> {
    const result = await this.request<{ id: string; status: string }>('GET', `/payments/${chargeId}`);
    return { id: result.id, status: result.status };
  }

  /** `GET /v3/finance/balance` (fase 2, REQ-7) — saldo disponível da subconta. */
  async getBalance(): Promise<AsaasBalanceResult> {
    const result = await this.request<{ balance: number }>('GET', '/finance/balance');
    return { balance: result.balance };
  }

  /** `GET /v3/transfers` (fase 2, REQ-7) — repasses da subconta, mais recente primeiro (ordem já
   * devolvida assim pelo Asaas). */
  async listTransfers(limit = 50): Promise<AsaasTransferResult[]> {
    const result = await this.request<{ data: AsaasTransferResult[] }>('GET', `/transfers?limit=${limit}`);
    return result.data;
  }

  /** `POST /v3/transfers` (specs/0194-ajustes-menu-ajuda-assinatura-estoque REQ-10) — repassa o
   * saldo disponível da subconta pra uma chave Pix de destino já cadastrada no restaurante. */
  async createTransfer(value: number, pixAddressKey: string, pixAddressKeyType: string): Promise<AsaasTransferResult> {
    return this.request<AsaasTransferResult>('POST', '/transfers', { value, pixAddressKey, pixAddressKeyType });
  }
}
