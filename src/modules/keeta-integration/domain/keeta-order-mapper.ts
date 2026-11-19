import { IOrderItem } from '../../orders/domain/entities/order.entity';
import { NewOrderInput } from '../../orders/domain/repositories/order.repository.interface';

/**
 * specs/0212-integracao-keeta — payload `orderInfo` do webhook `1001` (`orderPlacedNotification`),
 * mesmo shape de `/order/get` (`plan.md`, "Resumo da API real"). O shape real de `products[]` NÃO
 * é documentado publicamente — campos abaixo são os nomes mais prováveis (mesmo padrão de
 * `rebatesProducts`, o objeto de item mais completo documentado, embora de outro contexto); o
 * mapper trata tudo como opcional e nunca lança, mesmo se o payload real divergir (ver
 * `spec.md`, "Ambiguidades em aberto").
 */
export interface KeetaOrderInfo {
  baseOrder: {
    orderViewId: string;
    deliveryTime?: string;
    remark?: string;
    orderRemark?: string;
    payType?: string;
  };
  merchantOrder: {
    status: number;
    userGetMode: 'delivery' | 'pickup';
    seqNoStr?: string;
  };
  recipientInfo?: {
    name?: string;
    phone?: string;
    interCode?: string;
    addressName?: string;
    point?: { latitude?: number; longitude?: number };
    addressStruct?: string;
  };
  feeDtl?: {
    merchantFee?: number;
    customerFee?: number;
  };
  products?: {
    name?: string;
    spuId?: string;
    skuId?: string;
    count?: number;
    price?: number;
    remark?: string;
  }[];
}

/**
 * specs/0212-integracao-keeta REQ-4 — mapeia o `orderInfo` embutido no webhook `1001` pro
 * `NewOrderInput` interno. **Sempre** grava `keetaOrderViewId` (mesmo cuidado de
 * `mapNinetyNineFoodOrderToNewOrderInput` — nunca repetir o bug do iFood de não guardar o id
 * externo, documentado em `specs/0122-integracao-99food/plan.md`).
 */
export function mapKeetaOrderToNewOrderInput(
  orderInfo: KeetaOrderInfo,
  restaurantId: string,
  customerId: string,
): Omit<NewOrderInput, 'customerId' | 'restaurantId' | 'id'> & { customerId: string; restaurantId: string } {
  const items: IOrderItem[] = (orderInfo.products ?? []).map((product, index) => ({
    id: product.skuId || product.spuId || `keeta-item-${index}`,
    productId: product.skuId || product.spuId || `keeta-item-${index}`,
    productName: product.name || 'Item sem nome',
    quantity: product.count ?? 1,
    unitPrice: product.price ?? 0,
    notes: product.remark,
  }));

  // `feeDtl.merchantFee` pode vir incompleto/atrasado no webhook (admissão da própria doc da
  // Keeta, `plan.md`) — usa `customerFee` como fonte primária do total.
  const total = orderInfo.feeDtl?.customerFee ?? orderInfo.feeDtl?.merchantFee ?? 0;

  let deliveryAddress: string | undefined = orderInfo.recipientInfo?.addressName;
  if (!deliveryAddress && orderInfo.recipientInfo?.addressStruct) {
    try {
      const parsed = JSON.parse(orderInfo.recipientInfo.addressStruct) as { address?: string };
      deliveryAddress = parsed.address;
    } catch {
      // Shape de `addressStruct` não confirmado publicamente (`spec.md`, "Ambiguidades em
      // aberto") — nunca lança, só fica sem endereço estruturado.
    }
  }

  return {
    customerId,
    restaurantId,
    items,
    orderType: orderInfo.merchantOrder.userGetMode === 'pickup' ? 'pickup' : 'delivery',
    source: 'keeta',
    keetaOrderViewId: orderInfo.baseOrder.orderViewId,
    deliveryAddress,
    notes: orderInfo.baseOrder.remark || orderInfo.baseOrder.orderRemark,
    subtotal: total,
    deliveryFee: 0,
    discount: 0,
    total,
    // Pedido já vem pago/garantido pela Keeta antes de repassar (mesmo quando `payType ===
    // "Cash"`, que nesse contexto é "pago na entrega pro entregador da Keeta", não "cobrar de
    // novo no mobbs") — mesmo raciocínio do iFood/99Food.
    paymentMethod: 'creditCardOnline',
  };
}
