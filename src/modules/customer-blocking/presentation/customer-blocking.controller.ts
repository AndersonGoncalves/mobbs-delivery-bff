import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { normalizePhoneNumber } from '../../../shared/utils/normalize-phone-number';
import { ICustomerRepository } from '../../customers/domain/repositories/customer.repository.interface';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IBlockedCustomerRepository } from '../domain/repositories/blocked-customer.repository.interface';
import { blockCustomerSchema } from './customer-blocking.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * Pedido explícito do usuário — página "Bloquear cliente": o dono/gerente bloqueia um número de
 * celular (com DDD) pra esse telefone não conseguir fazer pedido neste restaurante (checagem em
 * `OrdersController`, condicionada ao liga/desliga `Restaurant.customerBlockingEnabled`).
 */
export class CustomerBlockingController extends BaseRouter {
  constructor(
    private readonly blockedCustomerRepository: IBlockedCustomerRepository,
    private readonly customerRepository: ICustomerRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    application.get('/restaurants/me/blocked-customers', ...authenticated, async (req: Request, res: Response) => {
      res.json(200, await this.blockedCustomerRepository.listByRestaurant(req.restaurantId!));
    });

    application.post('/restaurants/me/blocked-customers', ...authenticated, async (req: Request, res: Response) => {
      const { phone } = parseBody(blockCustomerSchema, req.body);
      const normalizedPhone = normalizePhoneNumber(phone);
      const customer = await this.customerRepository.findByPhone(normalizedPhone);
      // Achado crítico de auditoria (31/10/2026) — "findByPhone global permite correlação de PII
      // entre restaurantes": `customer` vem de uma busca GLOBAL, sem nenhuma relação exigida com
      // este restaurante — sem a guarda abaixo, bastava digitar qualquer telefone pra descobrir o
      // nome real de alguém que nunca pediu aqui, sob o pretexto de bloquear o número.
      const hasRelationship = !!customer && (
        customer.createdByRestaurantId === req.restaurantId
        || (await this.orderRepository.findManyByCustomerAndRestaurant(customer.id, req.restaurantId!)).length > 0
      );
      const blocked = await this.blockedCustomerRepository.block(req.restaurantId!, normalizedPhone, hasRelationship ? customer?.name : undefined);
      res.json(201, blocked);
    });

    application.del('/restaurants/me/blocked-customers/:id', ...authenticated, async (req: Request, res: Response) => {
      const removed = await this.blockedCustomerRepository.unblock(req.params.id, req.restaurantId!);
      if (!removed) throw new NotFoundError('Bloqueio não encontrado');
      res.send(204);
    });
  }
}
