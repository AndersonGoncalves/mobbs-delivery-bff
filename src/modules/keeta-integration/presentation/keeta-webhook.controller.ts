import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { webhookRateLimitMiddleware } from '../../../shared/http/rate-limits';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { mapKeetaOrderToNewOrderInput, KeetaOrderInfo } from '../domain/keeta-order-mapper';
import { verifyKeetaSignature } from '../domain/keeta-signature';

interface KeetaWebhookPayload {
  eventType: number;
  shopId?: string;
  brandId?: string;
  data?: unknown;
  sig?: string;
}

/**
 * specs/0212-integracao-keeta REQ-3/REQ-4 — endpoint único, sem auth de operador — autenticidade
 * vem só da assinatura `sig` (`plan.md`). Responde ACK `{"code":0,"message":"success"}` mesmo
 * quando não há nada a fazer (evento sem efeito nesta v1, restaurante não encontrado) — a Keeta
 * reentrega até 3x (~1 min de intervalo) se não receber o ACK (doc), então a resposta de sucesso
 * tem que ser o padrão sempre que o evento foi reconhecido, mesmo sem ação.
 */
export class KeetaWebhookController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly customerRepository: ICustomerRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly appSecret: string,
    // URL pública completa deste endpoint (`environment.bff.publicBaseUrl + '/webhooks/keeta'`)
    // — usada no cálculo de `sig` (`plan.md`: a assinatura inclui a URL). Fixa por configuração
    // em vez de reconstruída a partir de headers de host (evita depender de `X-Forwarded-Host`
    // não confiável atrás de proxy).
    private readonly webhookUrl: string,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.post('/webhooks/keeta', webhookRateLimitMiddleware, async (req: Request, res: Response) => {
      const body = req.body as KeetaWebhookPayload;
      const params: Record<string, string> = Object.fromEntries(
        Object.entries(body).filter(([key]) => key !== 'sig').map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]),
      );
      if (!verifyKeetaSignature(this.webhookUrl, params, this.appSecret, body.sig)) {
        res.send(401);
        return;
      }

      try {
        if (body.eventType === 1001) {
          await this.handleOrderPlaced(body.shopId, body.data as KeetaOrderInfo);
        } else if (body.eventType === 1303) {
          await this.handleBrandRevoked(body.brandId);
        }
        // Outros eventos (1101/1102/1201 — status; 1301/1302 — loja adicionada/removida):
        // reconhecidos sem efeito nesta v1, `plan.md`.
      } catch (error) {
        console.error(`[keeta-integration] erro inesperado processando webhook "${body.eventType}":`, error);
      }

      res.json(200, { code: 0, message: 'success' });
    });
  }

  private async handleOrderPlaced(shopId: string | undefined, orderInfo: KeetaOrderInfo | undefined): Promise<void> {
    if (!shopId || !orderInfo?.baseOrder?.orderViewId) return;

    // Dedup — a Keeta reentrega até 3x sem ACK (doc); nunca criar o mesmo pedido duas vezes.
    const existing = await this.orderRepository.findByKeetaOrderViewId(orderInfo.baseOrder.orderViewId);
    if (existing) return;

    const restaurant = await this.restaurantRepository.findByKeetaShopId(shopId);
    if (!restaurant) {
      console.warn(`[keeta-integration] pedido ${orderInfo.baseOrder.orderViewId} pra shopId ${shopId} sem restaurante vinculado.`);
      return;
    }

    const customer = await this.customerRepository.createStandalone(
      orderInfo.recipientInfo?.name || 'Cliente Keeta',
      orderInfo.recipientInfo?.phone,
    );
    const input = mapKeetaOrderToNewOrderInput(orderInfo, restaurant.id, customer.id);
    await this.orderRepository.create(input);
  }

  private async handleBrandRevoked(brandId: string | undefined): Promise<void> {
    if (!brandId) return;
    await this.restaurantRepository.disconnectAllByKeetaBrandId(brandId);
  }
}
