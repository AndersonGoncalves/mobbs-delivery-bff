/**
 * specs/0090-integracao-ifood — cliente HTTP pra API de pedidos do iFood (`fetch` nativo, mesmo
 * padrão de `AsaasClient`: sem SDK de terceiro). Contrato (polling de eventos, acknowledgment,
 * detalhe do pedido, confirmar/solicitar cancelamento) documentado publicamente em
 * developer.ifood.com.br — `merchantId` identifica a loja em cada chamada (header
 * `x-polling-merchants` no polling; demais endpoints já incluem o id do pedido, que já carrega o
 * merchant por trás).
 *
 * `accessToken` é passado POR CHAMADA (não no construtor) — mesmo padrão de
 * `FacebookGraphClient.createMediaContainer`: uma única instância é compartilhada (injetada),
 * já que o token muda por restaurante/credencial, não por processo do BFF.
 */
export interface IFoodEvent {
  id: string;
  code: string;
  orderId: string;
  createdAt: string;
}

export interface IFoodOrderCustomer {
  name: string;
  phone?: { number: string } | string;
}

export interface IFoodOrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: { value: number };
  totalPrice: { value: number };
  observations?: string;
}

export interface IFoodOrderDelivery {
  deliveryAddress?: {
    formattedAddress?: string;
    streetName?: string;
    streetNumber?: string;
    neighborhood?: string;
  };
}

export interface IFoodOrderDetails {
  id: string;
  displayId: string;
  orderType: 'DELIVERY' | 'TAKEOUT' | 'INDOOR';
  customer: IFoodOrderCustomer;
  items: IFoodOrderItem[];
  total: { orderAmount: { value: number }; deliveryFee?: { value: number } };
  delivery?: IFoodOrderDelivery;
  payments?: { methods: { value: { value: number } }[] };
}

export class IFoodClient {
  constructor(private readonly baseUrl: string) {}

  private async request<T>(
    accessToken: string,
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      throw new Error(`iFood API (${method} ${path}) respondeu ${response.status}: ${responseBody}`);
    }

    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** `GET /order/v1.0/events:polling` — fila de eventos pendentes da loja (REQ-2). */
  async getEvents(accessToken: string, merchantId: string): Promise<IFoodEvent[]> {
    const result = await this.request<IFoodEvent[] | null>(accessToken, 'GET', '/order/v1.0/events:polling', undefined, {
      'x-polling-merchants': merchantId,
    });
    return result ?? [];
  }

  /** `POST /order/v1.0/events/acknowledgment` — confirma o recebimento, evita reprocessar o
   * mesmo evento no próximo ciclo de polling (REQ-4). */
  async acknowledgeEvents(accessToken: string, eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    await this.request(accessToken, 'POST', '/order/v1.0/events/acknowledgment', eventIds.map((id) => ({ id })));
  }

  /** `GET /order/v1.0/orders/:id` — detalhe completo, buscado quando o evento é "pedido
   * colocado" (REQ-3). */
  async getOrderDetails(accessToken: string, orderId: string): Promise<IFoodOrderDetails> {
    return this.request<IFoodOrderDetails>(accessToken, 'GET', `/order/v1.0/orders/${orderId}`);
  }

  /** `POST /order/v1.0/orders/:id/confirm` — confirmação do operador propagada pro iFood (REQ-5). */
  async confirmOrder(accessToken: string, orderId: string): Promise<void> {
    await this.request(accessToken, 'POST', `/order/v1.0/orders/${orderId}/confirm`);
  }

  /** `POST /order/v1.0/orders/:id/requestCancellation` — cancelamento do operador propagado pro
   * iFood, com motivo (REQ-6). */
  async requestCancellation(accessToken: string, orderId: string, reason: string): Promise<void> {
    await this.request(accessToken, 'POST', `/order/v1.0/orders/${orderId}/requestCancellation`, { reason });
  }
}
