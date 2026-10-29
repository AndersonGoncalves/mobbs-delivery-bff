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

  private async request<T>(method: string, path: string, params: Record<string, unknown>): Promise<T> {
    let response: Response;
    if (method === 'GET') {
      // specs/0130-integracao-99-entrega — `Get Entrega Order Details` é o único GET com params
      // (sempre strings planas: auth_token + order_id/entrega_order_id), por isso o cast abaixo
      // é seguro; nenhum endpoint GET desta classe usa objeto aninhado.
      const query = new URLSearchParams(params as Record<string, string>).toString();
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

  // --- specs/0130-integracao-99-entrega — seção "Entrega API" do mesmo portal, mesmo
  // `auth_token` de loja das chamadas acima. Ver `plan.md`, "Resumo da API real".

  /** `POST /v3/entrega/authorization/register` — REQ-1, uma vez por loja. */
  async activateEntregaService(authToken: string): Promise<void> {
    await this.request<Record<string, never>>('POST', '/v3/entrega/authorization/register', { auth_token: authToken });
  }

  /** `POST /v3/entrega/order/estimation` — devolve o `estimate_id` (só serve pra uma entrega) e
   * o preço em centavos. */
  async estimateEntregaPrice(authToken: string, address: EntregaEstimationAddresses): Promise<EntregaEstimation> {
    const data = await this.request<{
      id: string;
      fee: number;
      currency: string;
      created_time: number;
      expires_time: number;
      delivery_distance: number;
      delivery_duration: number;
    }>('POST', '/v3/entrega/order/estimation', {
      auth_token: authToken,
      vehicle_type: 'entrega_moto',
      pickup_info: toEntregaLocationInfo(address.pickup),
      dropoff_info: toEntregaLocationInfo(address.dropoff),
    });
    return { estimateId: data.id, fee: data.fee, currency: data.currency, expiresAt: data.expires_time };
  }

  /** `POST /v3/entrega/order/place` — `orderId` é o id do pedido no sistema da 99Food
   * ("99Food order ID" na doc), não o nosso `Order.id`. Endereços devem ser IDÊNTICOS aos usados
   * na cotação (doc oficial). */
  async placeEntregaOrder(authToken: string, orderId: string, estimateId: string, address: EntregaEstimationAddresses): Promise<EntregaPlacedOrder> {
    const data = await this.request<{ entrega: { order_id: string }; order_id: string }>('POST', '/v3/entrega/order/place', {
      auth_token: authToken,
      vehicle_type: 'entrega_moto',
      order_id: orderId,
      pickup_info: toEntregaContactInfo(address.pickup),
      dropoff_info: toEntregaContactInfo(address.dropoff),
      // Sem rastreio de peso real do pedido — aproximação documentada em `plan.md`.
      package_info: { package_type: 'food', package_weight: '5kg' },
      estimate_id: estimateId,
    });
    return { entregaOrderId: data.entrega.order_id };
  }

  /** `GET /v3/entrega/order/detail` — exatamente um de `orderId`/`entregaOrderId`. */
  async getEntregaOrderDetails(authToken: string, ids: { orderId?: string; entregaOrderId?: string }): Promise<EntregaOrderDetails> {
    const data = await this.request<{
      status: EntregaRawStatus;
      tracking_link?: string;
      driver_info?: { name?: string; phone?: string };
    }>('GET', '/v3/entrega/order/detail', {
      auth_token: authToken,
      ...(ids.orderId ? { order_id: ids.orderId } : {}),
      ...(ids.entregaOrderId ? { entrega_order_id: ids.entregaOrderId } : {}),
    });
    return { status: data.status, trackingLink: data.tracking_link, courierName: data.driver_info?.name, courierPhone: data.driver_info?.phone };
  }

  /** `POST /v3/entrega/order/cancel` — `410018` é o único `reason_id` suportado pela doc
   * ("Delivery no longer needed"). */
  async cancelEntregaOrder(authToken: string, ids: { orderId?: string; entregaOrderId?: string }): Promise<void> {
    await this.request<boolean>('POST', '/v3/entrega/order/cancel', {
      auth_token: authToken,
      ...(ids.orderId ? { order_id: ids.orderId } : {}),
      ...(ids.entregaOrderId ? { entrega_order_id: ids.entregaOrderId } : {}),
      reason_id: '410018',
    });
  }
}

export interface EntregaAddress {
  street: string;
  number?: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  lat?: number;
  lng?: number;
  name: string;
  phone?: string;
  note?: string;
}

export interface EntregaEstimationAddresses {
  pickup: EntregaAddress;
  dropoff: EntregaAddress;
}

export interface EntregaEstimation {
  estimateId: string;
  fee: number;
  currency: string;
  expiresAt: number;
}

export interface EntregaPlacedOrder {
  entregaOrderId: string;
}

export type EntregaRawStatus = 'finding' | 'waiting' | 'delivering' | 'completed' | 'canceled' | 'closed' | 'sendback' | 'sendbackCompleted';

export interface EntregaOrderDetails {
  status: EntregaRawStatus;
  trackingLink?: string;
  courierName?: string;
  courierPhone?: string;
}

function toEntregaLocationInfo(address: EntregaAddress) {
  return {
    structured_address: {
      street: address.street,
      number: address.number,
      complement: address.complement,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      country: address.country,
      cep: address.zipCode,
    },
    ...(address.lat !== undefined && address.lng !== undefined ? { location: { lat: address.lat, lng: address.lng } } : {}),
  };
}

function toEntregaContactInfo(address: EntregaAddress) {
  return {
    ...toEntregaLocationInfo(address),
    name: address.name,
    phone: address.phone,
    note: address.note ?? '',
  };
}
