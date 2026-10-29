import { INinetyNineFoodDeliveryAddress, IOrderItem } from '../../orders/domain/entities/order.entity';
import { NewOrderInput } from '../../orders/domain/repositories/order.repository.interface';

/** Payload `data.order_info` do webhook `orderNew` (`plan.md`, "Resumo da API real") — campos de
 * 64 bits (`order_id`) já chegam como `string` (parse big-int-safe, `ninety-nine-food-webhook-verifier.ts`). */
export interface NinetyNineFoodOrderInfo {
  order_id: string;
  fulfillment_mode: 0 | 1;
  remark?: string;
  price: {
    real_pay_price?: number;
    customer_need_paying_money?: number;
    order_price: number;
    delivery_price?: number;
    delivery_discount?: number;
    items_discount?: number;
  };
  receive_address?: {
    name?: string;
    phone?: string;
    poi_address?: string;
    poi_display_name?: string;
    // specs/0130-integracao-99-entrega — endereço estruturado, só usado pra montar
    // `dropoff_info` da API de 99 Entrega (ver `ninetyNineFoodDeliveryAddress` abaixo).
    street_name?: string;
    street_number?: string;
    house_number?: string;
    complement?: string;
    district?: string;
    city?: string;
    state?: string;
    country?: string;
    postal_code?: string;
    poi_lat?: number;
    poi_lng?: number;
  };
  order_items: {
    app_item_id: string;
    name: string;
    amount: number;
    sku_price: number;
    remark?: string;
  }[];
}

/**
 * specs/0122-integracao-99food REQ-4 — mapeia o `order_info` embutido no webhook `orderNew` pro
 * `NewOrderInput` interno. Mesmo espírito de `mapIFoodOrderToNewOrderInput`, mas **sempre** grava
 * `ninetyNineFoodOrderId` (ver `plan.md`, "Risco real encontrado no código existente" — o
 * equivalente do iFood não grava o id externo em lugar nenhum, o que quebraria
 * confirmar/cancelar; aqui não repetimos esse erro).
 */
export function mapNinetyNineFoodOrderToNewOrderInput(
  orderInfo: NinetyNineFoodOrderInfo,
  restaurantId: string,
  customerId: string,
): Omit<NewOrderInput, 'customerId' | 'restaurantId' | 'id'> & { customerId: string; restaurantId: string } {
  const items: IOrderItem[] = orderInfo.order_items.map((item) => ({
    id: item.app_item_id,
    productId: item.app_item_id,
    productName: item.name,
    quantity: item.amount,
    unitPrice: item.sku_price,
    notes: item.remark,
  }));

  const subtotal = orderInfo.price.order_price;
  const deliveryFee = orderInfo.price.delivery_price ?? 0;
  // Doc ("Price Model 1/2/3") não deixa claro qual modelo nosso contrato vai usar — tenta na
  // ordem de probabilidade, documentado como risco em `plan.md`.
  const total = orderInfo.price.real_pay_price ?? orderInfo.price.customer_need_paying_money ?? orderInfo.price.order_price;

  // specs/0130-integracao-99-entrega — endereço estruturado pra `dropoff_info` da Entrega; só
  // existe se os campos mínimos (logradouro, bairro, cidade, estado, CEP) vierem presentes —
  // ausentes na variante "Being Processed" da Política de Privacidade da 99Food
  // (`plan.md`, "Riscos"), caso em que o despacho de Entrega não poderá ser feito pra este pedido.
  const address = orderInfo.receive_address;
  const ninetyNineFoodDeliveryAddress: INinetyNineFoodDeliveryAddress | undefined =
    address?.street_name && address?.district && address?.city && address?.state && address?.postal_code
      ? {
          street: address.street_name,
          number: address.street_number || address.house_number,
          complement: address.complement,
          neighborhood: address.district,
          city: address.city,
          state: address.state,
          country: address.country || 'BRASIL',
          zipCode: address.postal_code,
          lat: address.poi_lat,
          lng: address.poi_lng,
        }
      : undefined;

  return {
    customerId,
    restaurantId,
    items,
    // fulfillment_mode: 0-Delivery, 1-Self Pickup. 99Food nunca manda pedido de mesa.
    orderType: orderInfo.fulfillment_mode === 1 ? 'pickup' : 'delivery',
    source: '99food',
    ninetyNineFoodOrderId: orderInfo.order_id,
    deliveryAddress: orderInfo.receive_address?.poi_address || orderInfo.receive_address?.poi_display_name,
    ninetyNineFoodDeliveryAddress,
    notes: orderInfo.remark,
    subtotal,
    deliveryFee,
    discount: (orderInfo.price.items_discount ?? 0) + (orderInfo.price.delivery_discount ?? 0),
    total,
    // Pedido do 99Food já vem pago/garantido pela própria plataforma deles (nunca cobrado por
    // nós de novo) — mesmo raciocínio de `mapIFoodOrderToNewOrderInput`.
    paymentMethod: 'creditCardOnline',
  };
}
