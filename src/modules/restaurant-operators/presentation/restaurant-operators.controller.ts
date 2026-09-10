import type { Request, Response, Server } from 'restify';
import { BadRequestError, ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IRestaurantOperatorRepository } from '../domain/repositories/restaurant-operator.repository.interface';
import { addOperatorSchema, updateOperatorRoleSchema } from '../../restaurants/presentation/restaurants.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0010-configuracao-restaurante REQ-12/REQ-13 — gestão da allowlist de e-mails com acesso à
 * retaguarda do próprio restaurante (nunca de outro, `restaurantId` sempre do token via
 * `restaurantOperatorMiddleware`, nunca de parâmetro de rota).
 *
 * specs/0021-papeis-operador REQ-6/T008 — cadastrar/remover/listar e trocar papel só `dono`
 * (`requireOperatorRole('dono')`); `GET .../operators/me` é a exceção (T010, qualquer operador
 * autenticado pode saber o próprio papel — é assim que a web decide o que mostrar na navegação).
 */
export class RestaurantOperatorsController extends BaseRouter {
  constructor(
    private readonly operatorRepository: IRestaurantOperatorRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const authenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.restaurantOperatorMiddleware];
    const ownerAuthenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono'),
    ];

    // specs/0021-papeis-operador T010 — qualquer operador logado sabe o próprio papel (usado
    // pela web pra decidir o que mostrar na navegação, REQ-5 UX — a barreira real continua sendo
    // o 403 de cada rota de módulo).
    application.get('/restaurants/me/operators/me', ...authenticated, async (req: Request, res: Response) => {
      const operator = await this.operatorRepository.findById(req.operatorId!);
      res.json(200, this.render(operator));
    });

    application.get('/restaurants/me/operators', ...ownerAuthenticated, async (req: Request, res: Response) => {
      const operators = await this.operatorRepository.listByRestaurant(req.restaurantId!);
      res.json(200, operators);
    });

    application.post('/restaurants/me/operators', ...ownerAuthenticated, async (req: Request, res: Response) => {
      const { email, role } = parseBody(addOperatorSchema, req.body);
      const operator = await this.operatorRepository.create(req.restaurantId!, email, role);
      res.json(201, operator);
    });

    application.del(
      '/restaurants/me/operators/:id',
      ...ownerAuthenticated,
      async (req: Request, res: Response) => {
        const target = await this.operatorRepository.findById(req.params.id);
        if (!target || target.restaurantId !== req.restaurantId) {
          throw new NotFoundError('Operador não encontrado');
        }
        if (target.isActive) {
          const activeCount = await this.operatorRepository.countActiveByRestaurant(req.restaurantId!);
          // REQ-13: nunca deixar o restaurante sem nenhum operador ativo.
          if (activeCount <= 1) {
            throw new BadRequestError('Não é possível remover o único operador ativo do restaurante');
          }
        }
        await this.operatorRepository.deactivate(target.id);
        res.send(204);
      },
    );

    // specs/0021-papeis-operador REQ-8/REQ-9/T009 — troca de papel de um operador já cadastrado.
    // REQ-9: se `target` é o único `dono` ativo do restaurante e o novo papel não é mais `dono`,
    // bloqueia com 409 (nunca pode restar um restaurante sem nenhum `dono` ativo) — checado por
    // `target`, não só por "é o próprio operador logado", porque a regra é sobre o restaurante
    // nunca ficar sem dono, não sobre quem executa a ação.
    application.patch(
      '/restaurants/me/operators/:id/role',
      ...ownerAuthenticated,
      async (req: Request, res: Response) => {
        const { role } = parseBody(updateOperatorRoleSchema, req.body);
        const target = await this.operatorRepository.findById(req.params.id);
        if (!target || target.restaurantId !== req.restaurantId) {
          throw new NotFoundError('Operador não encontrado');
        }

        if (target.role === 'dono' && role !== 'dono' && target.isActive) {
          const activeOwners = await this.operatorRepository.countActiveByRestaurantAndRole(req.restaurantId!, 'dono');
          if (activeOwners <= 1) {
            throw new ConflictError('Não é possível rebaixar o único dono ativo do restaurante');
          }
        }

        await this.operatorRepository.updateRole(target.id, role);
        const updated = await this.operatorRepository.findById(target.id);
        res.json(200, this.render(updated));
      },
    );
  }
}
