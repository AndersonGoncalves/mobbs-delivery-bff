import type { Request, Response, Server } from 'restify';
import { BadRequestError, ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IFiscalConfigRepository } from '../domain/repositories/fiscal-config.repository.interface';
import { FiscalEmissionService } from '../domain/services/fiscal-emission.service';
import { cancelFiscalDocumentSchema } from './fiscal-config.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0091-integracao-fiscal-focusnfe REQ-4/REQ-6 — reemissão manual e cancelamento da nota de
 * um pedido, restrito a dono/gerente (mesmo critério de acesso de `/orders/:id/status`/`cancel`).
 * Validação de precondição fica aqui (ver docstring de `FiscalEmissionService`): o serviço só
 * executa, quem decide "pode" é este controller.
 */
export class FiscalOrderActionsController extends BaseRouter {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly fiscalConfigRepository: IFiscalConfigRepository,
    private readonly fiscalEmissionService: FiscalEmissionService,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  private async findOwnedOrder(id: string, restaurantId: string) {
    const order = await this.orderRepository.findById(id);
    if (!order || order.restaurantId !== restaurantId) throw new NotFoundError('Pedido não encontrado');
    return order;
  }

  initializeRoutes(application: Server): void {
    const operatorAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    // REQ-4 — só permite reemitir se ainda não houver nota autorizada; nunca reemite pedido
    // cancelado (REQ-6 vale pra reemissão manual também, não só pro gatilho automático).
    application.post('/restaurants/me/orders/:id/fiscal/retry', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const order = await this.findOwnedOrder(req.params.id, req.restaurantId!);
      if (order.status === 'cancelado') throw new BadRequestError('Pedido cancelado não pode emitir nota fiscal');
      if (order.fiscal?.status === 'emitido') throw new ConflictError('Pedido já tem nota fiscal emitida');

      const config = await this.fiscalConfigRepository.findByRestaurantId(req.restaurantId!);
      if (!config) throw new BadRequestError('Configuração fiscal não encontrada — configure em Integrações > Fiscal antes de emitir');
      if (config.environment === 'producao' && !config.productionEnabled) {
        throw new BadRequestError('Ative "produção" na configuração fiscal antes de emitir notas reais');
      }

      await this.fiscalEmissionService.retryEmission(order, config);
      res.json(200, await this.orderRepository.findById(order.id));
    });

    // REQ-6 — só permite cancelar se já houver nota emitida.
    application.post('/restaurants/me/orders/:id/fiscal/cancel', ...operatorAuthenticated, async (req: Request, res: Response) => {
      const { justificativa } = parseBody(cancelFiscalDocumentSchema, req.body);
      const order = await this.findOwnedOrder(req.params.id, req.restaurantId!);
      if (order.fiscal?.status !== 'emitido' || !order.fiscal.ref) {
        throw new ConflictError('Pedido não tem nota fiscal emitida pra cancelar');
      }

      const config = await this.fiscalConfigRepository.findByRestaurantId(req.restaurantId!);
      if (!config) throw new BadRequestError('Configuração fiscal não encontrada');

      await this.fiscalEmissionService.cancelDocument(order, config, justificativa);
      res.json(200, await this.orderRepository.findById(order.id));
    });
  }
}
