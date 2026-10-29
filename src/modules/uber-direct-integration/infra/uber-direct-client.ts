/**
 * specs/0121-integracao-uber-entregas — cliente HTTP pra API da Uber Direct (`fetch` nativo,
 * mesmo padrão de `IFoodClient`/`AsaasClient`). Contrato confirmado na doc pública
 * (developer.uber.com) em 2026-10-29 — ver `plan.md`, "Pesquisa da API real":
 * - Cotação: `POST https://api.uber.com/v1/customers/{customer_id}/delivery_quotes`.
 * - Criação da entrega: `POST https://api.uber.com/v1/customers/{customer_id}/deliveries`.
 * - Consulta (GET) e cancelamento não têm endpoint confirmado na doc pública acessível nesta
 *   sessão — não implementados (não exigidos por nenhum REQ desta v1, que é 100% webhook-driven
 *   pra status, `plan.md` "Limitações conhecidas" #2).
 *
 * `accessToken` é passado POR CHAMADA (não no construtor), mesmo padrão de `IFoodClient` — uma
 * única instância é compartilhada, o token muda por restaurante/credencial.
 */
export interface UberDeliveryAddress {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
}

export interface UberManifestItem {
  name: string;
  quantity: number;
}

export interface UberDeliveryQuote {
  id: string;
  kind: string;
  fee: number;
  currency: string;
  dropoff_eta?: string;
  expires?: string;
}

/** Enum completo confirmado na doc pública (`plan.md`). */
export type UberDeliveryRawStatus = 'pending' | 'pickup' | 'pickup_complete' | 'dropoff' | 'delivered' | 'canceled' | 'returned';

export interface UberDelivery {
  id: string;
  status: UberDeliveryRawStatus;
  tracking_url?: string;
  fee?: number;
  currency?: string;
}

function toAddressJson(address: UberDeliveryAddress): string {
  return JSON.stringify({
    street_address: [address.streetAddress],
    city: address.city,
    state: address.state,
    zip_code: address.zipCode,
    country: address.country ?? 'BR',
  });
}

export class UberDirectClient {
  private async request<T>(accessToken: string, customerId: string, method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`https://api.uber.com/v1/customers/${encodeURIComponent(customerId)}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Uber Direct API (${method} ${path}) respondeu ${response.status}: ${text}`);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** `POST /delivery_quotes` (REQ-2) — avalia cobertura/custo antes de criar a entrega de fato. */
  async createQuote(accessToken: string, customerId: string, pickup: UberDeliveryAddress, dropoff: UberDeliveryAddress): Promise<UberDeliveryQuote> {
    return this.request<UberDeliveryQuote>(accessToken, customerId, 'POST', '/delivery_quotes', {
      pickup_address: toAddressJson(pickup),
      dropoff_address: toAddressJson(dropoff),
    });
  }

  /** `POST /deliveries` (REQ-2) — cria a entrega a partir de uma cotação aceita. */
  async createDelivery(
    accessToken: string,
    customerId: string,
    input: {
      quoteId: string;
      pickup: UberDeliveryAddress;
      pickupName: string;
      pickupPhoneNumber: string;
      dropoff: UberDeliveryAddress;
      dropoffName: string;
      dropoffPhoneNumber: string;
      manifestItems: UberManifestItem[];
    },
  ): Promise<UberDelivery> {
    return this.request<UberDelivery>(accessToken, customerId, 'POST', '/deliveries', {
      quote_id: input.quoteId,
      pickup_address: toAddressJson(input.pickup),
      pickup_name: input.pickupName,
      pickup_phone_number: input.pickupPhoneNumber,
      dropoff_address: toAddressJson(input.dropoff),
      dropoff_name: input.dropoffName,
      dropoff_phone_number: input.dropoffPhoneNumber,
      manifest_items: input.manifestItems.map((item) => ({ name: item.name, quantity: item.quantity })),
    });
  }
}
