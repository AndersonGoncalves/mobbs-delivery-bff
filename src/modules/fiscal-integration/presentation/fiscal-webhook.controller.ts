import type { Request, Response, Server } from 'restify';
import { NotFoundError, UnauthorizedError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { FocusNfeWebhookPayload } from '../infra/focus-nfe-client';
import { FiscalEmissionService } from '../domain/services/fiscal-emission.service';
import { IFiscalConfigRepository } from '../domain/repositories/fiscal-config.repository.interface';

/**
 * specs/0091-integracao-fiscal-focusnfe REQ-3 — retorno assíncrono da FocusNFe. Mesmo padrão de
 * `AsaasWebhookController` (`POST /webhooks/asaas/:restaurantId`): o restaurante já vem no path,
 * autenticação é "o header bate com o token DESTE restaurante" (`FiscalConfig.webhookToken`),
 * sem Firebase nem operador logado — quem chama é a FocusNFe. Header próprio
 * (`focusnfe-webhook-token`), nunca o mesmo nome do Asaas — são segredos de integrações
 * diferentes.
 *
 * `ref` no payload é o identificador que o BFF escolheu na emissão (`Order.id`, ver
 * `FocusNfeApiClient`/`FiscalEmissionService`) — resolve o pedido direto por ele.
 *
 * Responde 200 mesmo quando não há nada a fazer (evento já aplicado, pedido não encontrado) —
 * mesmo raciocínio do Asaas: devolver erro pra algo que só não precisa de ação faria a FocusNFe
 * reentregar/alertar sem motivo.
 */
export class FiscalWebhookController extends BaseRouter {
  constructor(
    private readonly fiscalConfigRepository: IFiscalConfigRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly fiscalEmissionService: FiscalEmissionService,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.post('/webhooks/focusnfe/:restaurantId', async (req: Request, res: Response) => {
      const config = await this.fiscalConfigRepository.findByRestaurantId(req.params.restaurantId);
      const token = req.header('focusnfe-webhook-token');
      if (!config || token !== config.webhookToken) {
        throw new UnauthorizedError('Token de webhook inválido');
      }

      const payload = req.body as FocusNfeWebhookPayload;
      if (!payload.ref) {
        res.send(200);
        return;
      }

      const order = await this.orderRepository.findById(payload.ref);
      if (!order || order.restaurantId !== req.params.restaurantId) {
        throw new NotFoundError('Pedido não encontrado');
      }

      await this.fiscalEmissionService.applyWebhookResult(order.id, payload);
      res.send(200);
    });
  }
}
