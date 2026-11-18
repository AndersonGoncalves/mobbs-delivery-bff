import type { Request, Response, Server } from 'restify';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IRestaurantOperatorRepository } from '../../restaurant-operators/domain/repositories/restaurant-operator.repository.interface';
import {
  addOperatorSchema,
  updateOperatorFullAccessSchema,
  updateOperatorProfileSchema,
  updateOperatorRoleSchema,
} from '../../restaurants/presentation/restaurants.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * Pedido explícito do usuário (18/11/2026) — "tela de suporte", 2ª leva: operadores de qualquer
 * restaurante, administrados pelo admin da plataforma sem logar como o dono (ex.: dono perdeu
 * acesso ao e-mail cadastrado, ou precisa de ajuda pra resetar o `hasFullAccess` de um gerente).
 * Reaproveita o MESMO repositório/regras de `RestaurantOperatorsController` (nunca pode sobrar um
 * restaurante sem dono ativo, dono não pode ser removido, e-mail não pode estar ativo em outro
 * restaurante) — só muda de onde vem o `restaurantId` (`:id` da URL) e quem pode chamar.
 *
 * Diferente das outras telas de suporte: aqui fica um rastro mínimo (`recordAdminAction`, só os
 * campos `lastAdminActionByEmail`/`lastAdminActionAt`) a cada mutação feita por ESTAS rotas — é
 * quem entra na conta do cliente, informação sensível o bastante pra merecer isso desde já,
 * diferente de Integrações/ações rápidas (sem log nesta primeira leva, combinado como follow-up).
 *
 * Sem a restrição "gerente não mexe em dono" daqui pra baixo — essa regra é sobre o que UM
 * OPERADOR do restaurante pode fazer a outro, não se aplica ao admin da plataforma.
 */
export class PlatformRestaurantOperatorsController extends BaseRouter {
  constructor(
    private readonly operatorRepository: IRestaurantOperatorRepository,
    private readonly platformAdminMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const adminAuthenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.platformAdminMiddleware];

    application.get('/platform/restaurants/:id/operators', ...adminAuthenticated, async (req: Request, res: Response) => {
      const operators = await this.operatorRepository.listByRestaurant(req.params.id);
      res.json(200, operators);
    });

    application.post('/platform/restaurants/:id/operators', ...adminAuthenticated, async (req: Request, res: Response) => {
      const { email, role, name, whatsapp, photoUrl } = parseBody(addOperatorSchema, req.body);
      const activeElsewhere = await this.operatorRepository.findActiveByEmailInOtherRestaurant(email, req.params.id);
      if (activeElsewhere) {
        throw new ConflictError('Este e-mail já está associado a outro restaurante');
      }
      const operator = await this.operatorRepository.create(req.params.id, email, role, name, whatsapp, photoUrl);
      await this.operatorRepository.recordAdminAction(operator.id, req.user!.email!);
      const updated = await this.operatorRepository.findById(operator.id);
      res.json(201, this.render(updated));
    });

    application.del('/platform/restaurants/:id/operators/:operatorId', ...adminAuthenticated, async (req: Request, res: Response) => {
      const target = await this.operatorRepository.findById(req.params.operatorId);
      if (!target || target.restaurantId !== req.params.id) {
        throw new NotFoundError('Operador não encontrado');
      }
      if (target.role === 'dono') {
        throw new ForbiddenError('O operador dono não pode ser removido');
      }
      if (target.isActive) {
        const activeCount = await this.operatorRepository.countActiveByRestaurant(req.params.id);
        if (activeCount <= 1) {
          throw new BadRequestError('Não é possível remover o único operador ativo do restaurante');
        }
      }
      await this.operatorRepository.deactivate(target.id);
      await this.operatorRepository.recordAdminAction(target.id, req.user!.email!);
      res.send(204);
    });

    application.patch('/platform/restaurants/:id/operators/:operatorId/role', ...adminAuthenticated, async (req: Request, res: Response) => {
      const { role } = parseBody(updateOperatorRoleSchema, req.body);
      const target = await this.operatorRepository.findById(req.params.operatorId);
      if (!target || target.restaurantId !== req.params.id) {
        throw new NotFoundError('Operador não encontrado');
      }
      if (target.role === 'dono' && role !== 'dono' && target.isActive) {
        const activeOwners = await this.operatorRepository.countActiveByRestaurantAndRole(req.params.id, 'dono');
        if (activeOwners <= 1) {
          throw new ConflictError('Não é possível rebaixar o único dono ativo do restaurante');
        }
      }
      await this.operatorRepository.updateRole(target.id, role);
      await this.operatorRepository.recordAdminAction(target.id, req.user!.email!);
      const updated = await this.operatorRepository.findById(target.id);
      res.json(200, this.render(updated));
    });

    application.patch('/platform/restaurants/:id/operators/:operatorId/full-access', ...adminAuthenticated, async (req: Request, res: Response) => {
      const { hasFullAccess } = parseBody(updateOperatorFullAccessSchema, req.body);
      const target = await this.operatorRepository.findById(req.params.operatorId);
      if (!target || target.restaurantId !== req.params.id) {
        throw new NotFoundError('Operador não encontrado');
      }
      if (target.role !== 'gerente') {
        throw new BadRequestError('Acesso total só pode ser concedido a um gerente');
      }
      await this.operatorRepository.updateFullAccess(target.id, hasFullAccess);
      await this.operatorRepository.recordAdminAction(target.id, req.user!.email!);
      const updated = await this.operatorRepository.findById(target.id);
      res.json(200, this.render(updated));
    });

    application.patch('/platform/restaurants/:id/operators/:operatorId/profile', ...adminAuthenticated, async (req: Request, res: Response) => {
      const profile = parseBody(updateOperatorProfileSchema, req.body);
      const target = await this.operatorRepository.findById(req.params.operatorId);
      if (!target || target.restaurantId !== req.params.id) {
        throw new NotFoundError('Operador não encontrado');
      }
      await this.operatorRepository.updateProfile(target.id, profile);
      await this.operatorRepository.recordAdminAction(target.id, req.user!.email!);
      const updated = await this.operatorRepository.findById(target.id);
      res.json(200, this.render(updated));
    });
  }
}
