import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IMotoboyRepository } from '../domain/repositories/motoboy.repository.interface';
import { saveMotoboySchema, setMotoboyActiveSchema } from './motoboy.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0119-cadastro-motoboys — motoboys do restaurante do operador logado, mesmo padrão de
 * isolamento `restaurants.me.*` já usado em `suppliers`/`raw-materials`.
 */
export class MotoboysController extends BaseRouter {
  constructor(
    private readonly motoboyRepository: IMotoboyRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    // specs/0021-papeis-operador — mesmo papel de fornecedores/estoque: `dono`/`gerente`.
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    application.get('/restaurants/me/motoboys', ...authenticated, async (req: Request, res: Response) => {
      const motoboys = await this.motoboyRepository.listByRestaurant(req.restaurantId!);
      res.json(200, motoboys);
    });

    application.post('/restaurants/me/motoboys', ...authenticated, async (req: Request, res: Response) => {
      const payload = parseBody(saveMotoboySchema, req.body);
      const motoboy = await this.motoboyRepository.create(req.restaurantId!, payload);
      res.json(201, motoboy);
    });

    application.put('/restaurants/me/motoboys/:id', ...authenticated, async (req: Request, res: Response) => {
      const payload = parseBody(saveMotoboySchema, req.body);
      await this.findOwnedMotoboy(req.params.id, req.restaurantId!);
      const motoboy = await this.motoboyRepository.update(req.params.id, payload);
      res.json(200, motoboy);
    });

    application.patch(
      '/restaurants/me/motoboys/:id/active',
      ...authenticated,
      async (req: Request, res: Response) => {
        const { isActive } = parseBody(setMotoboyActiveSchema, req.body);
        await this.findOwnedMotoboy(req.params.id, req.restaurantId!);
        const motoboy = await this.motoboyRepository.setActive(req.params.id, isActive);
        res.json(200, motoboy);
      },
    );
  }

  private async findOwnedMotoboy(id: string, restaurantId: string) {
    const motoboy = await this.motoboyRepository.findById(id);
    if (!motoboy || motoboy.restaurantId !== restaurantId) {
      throw new NotFoundError('Motoboy não encontrado');
    }
    return motoboy;
  }
}
