import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { EntregaDeliveryStatus } from '../../orders/domain/entities/order.entity';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { NinetyNineFoodAuthService } from '../infra/ninety-nine-food-auth.service';
import { mapNinetyNineFoodOrderToNewOrderInput, NinetyNineFoodOrderInfo } from '../domain/ninety-nine-food-order-mapper';
import { parseNinetyNineFoodWebhookBody, verifyNinetyNineFoodSignature } from '../domain/ninety-nine-food-webhook-verifier';

interface NinetyNineFoodWebhookPayload {
  app_id: string;
  app_shop_id?: string;
  type: string;
  timestamp: number;
  data: unknown;
}

interface OrdersControllerLike {
  markDeliveredViaExternalCourier(orderId: string, restaurantId: string): Promise<void>;
}

/** specs/0130-integracao-99-entrega — `plan.md`, "Domain". `180 REASSIGNED` continua `aceito`
 * (entregador trocado, entrega ainda ativa). */
const DELIVERY_STATUS_MAP: Record<number, EntregaDeliveryStatus> = {
  120: 'aceito',
  130: 'aceito',
  140: 'a_caminho',
  150: 'a_caminho',
  160: 'entregue',
  170: 'cancelado',
  180: 'aceito',
  190: 'cancelado',
};

/**
 * specs/0122-integracao-99food REQ-1/REQ-2/REQ-4 — endpoint único (`app_id` é de nível de app,
 * não por restaurante), sem auth de operador — autenticidade vem só da assinatura
 * (`didi-header-sign`, `plan.md`). Responde `200` mesmo quando não há nada a fazer (evento sem
 * efeito nesta v1, restaurante não encontrado) — mesmo raciocínio de
 * `UberDeliveryWebhookController`/Asaas/FocusNFe: devolver erro pra um evento que só não precisa
 * de ação faria a 99Food reentregar sem motivo.
 */
export class NinetyNineFoodWebhookController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly customerRepository: ICustomerRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly ninetyNineFoodAuthService: NinetyNineFoodAuthService,
    private readonly appSecret: string,
    // specs/0130-integracao-99-entrega REQ-5 — reusa o mesmo método já existente desde
    // specs/0121-integracao-uber-entregas (`markDeliveredViaExternalCourier`), sem duplicar a
    // lógica de efeitos colaterais da transição pra "entregue".
    private readonly ordersController: OrdersControllerLike,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.post('/webhooks/99food', async (req: Request, res: Response) => {
      const rawBody = typeof req.rawBody === 'string' ? req.rawBody : String(req.rawBody ?? '');
      const signature = req.header('didi-header-sign');
      if (!verifyNinetyNineFoodSignature(rawBody, this.appSecret, signature)) {
        res.send(401);
        return;
      }

      // CRÍTICO (`plan.md`) — nunca usar `req.body` pra `app_id`/`order_id`/`shop_id`: o
      // `bodyParser` global já perdeu precisão nesses inteiros de 64 bits com `JSON.parse`
      // padrão. Reparseia o `rawBody` com `json-bigint`.
      const payload = parseNinetyNineFoodWebhookBody(rawBody) as NinetyNineFoodWebhookPayload;

      try {
        if (payload.type === 'shopBindStatus') {
          await this.handleShopBindStatus(payload.data as { appShopIDList: string[]; bindStatus: string });
        } else if (payload.type === 'orderNew') {
          await this.handleOrderNew(payload.app_shop_id, payload.data as { order_id: string; order_info: NinetyNineFoodOrderInfo });
        } else if (payload.type === 'deliveryStatus') {
          // specs/0130-integracao-99-entrega REQ-5/REQ-7 — mesmo endpoint de webhook, evento
          // novo (99Food Protocol > Logistics > Logistics Webhooks, reaproveitado pela Entrega
          // API conforme a doc oficial, `plan.md`).
          await this.handleDeliveryStatus(payload.data as { order_id: string; delivery_status: number; rider_name?: string; rider_phone?: string });
        }
        // Outros `type` (orderConfirm/orderReady/orderCancel/orderPartialCancel/orderFinish/
        // orderCancelApply/orderRefundApply/shopStatus/imageAuditStatus/autoOnlineResult):
        // reconhecidos sem efeito nesta v1 — fora de escopo, `plan.md`.
      } catch (error) {
        console.error(`[99food-integration] erro inesperado processando webhook "${payload.type}":`, error);
      }

      res.send(200);
    });
  }

  private async handleShopBindStatus(data: { appShopIDList: string[]; bindStatus: string }): Promise<void> {
    if (data.bindStatus !== 'bind' || !data.appShopIDList?.length) return;

    const appShopId = data.appShopIDList[0];
    if (data.appShopIDList.length > 1) {
      console.warn(`[99food-integration] shopBindStatus trouxe ${data.appShopIDList.length} lojas; processando só a primeira (${appShopId}).`);
    }

    // Matching FIFO (limitação de design documentada em `plan.md`) — a API não deixa escolher o
    // restaurante no momento de gerar o link de autorização.
    const restaurant = await this.restaurantRepository.findOldestPendingNinetyNineFoodAuthorization();
    if (!restaurant) {
      console.warn(`[99food-integration] shopBindStatus (bind) pra app_shop_id ${appShopId} sem nenhum restaurante com autorização pendente.`);
      return;
    }

    const { authToken, tokenExpiresAt } = await this.ninetyNineFoodAuthService.getAuthtokenForNewBinding(appShopId);
    await this.restaurantRepository.saveNinetyNineFoodBinding(restaurant.id, { appShopId, authToken, tokenExpiresAt });
  }

  private async handleOrderNew(appShopId: string | undefined, data: { order_id: string; order_info: NinetyNineFoodOrderInfo }): Promise<void> {
    if (!appShopId) return;

    const restaurant = await this.restaurantRepository.findByNinetyNineFoodAppShopId(appShopId);
    if (!restaurant) {
      console.warn(`[99food-integration] orderNew (pedido ${data.order_id}) pra app_shop_id ${appShopId} sem restaurante vinculado.`);
      return;
    }

    const orderInfo = data.order_info;
    const customer = await this.customerRepository.createStandalone(
      orderInfo.receive_address?.name || 'Cliente 99Food',
      orderInfo.receive_address?.phone,
    );
    const input = mapNinetyNineFoodOrderToNewOrderInput(orderInfo, restaurant.id, customer.id);
    await this.orderRepository.create(input);
  }

  private async handleDeliveryStatus(data: { order_id: string; delivery_status: number; rider_name?: string; rider_phone?: string }): Promise<void> {
    const order = await this.orderRepository.findByNinetyNineFoodOrderId(data.order_id);
    if (!order || !order.entregaDelivery) {
      // Pedido sem entrega 99 Entrega ativa (ex.: evento do delivery_type=1, entrega da própria
      // 99Food, nunca despachada por nós) — nada a fazer, mesmo raciocínio de "sem efeito" acima.
      return;
    }

    const status = DELIVERY_STATUS_MAP[data.delivery_status] ?? order.entregaDelivery.status;
    const updated = await this.orderRepository.updateEntregaDelivery(order.id, {
      ...order.entregaDelivery,
      status,
      courierName: data.rider_name ?? order.entregaDelivery.courierName,
      courierPhone: data.rider_phone ?? order.entregaDelivery.courierPhone,
    });

    // REQ-5 — só tenta a transição de status quando a 99Food confirma "FINISH" (160); no-op
    // silencioso se o pedido não estiver num estado que permita ir pra "entregue" (ver docstring
    // de `markDeliveredViaExternalCourier`).
    if (status === 'entregue') {
      await this.ordersController.markDeliveredViaExternalCourier(updated.id, updated.restaurantId);
    }
  }
}
