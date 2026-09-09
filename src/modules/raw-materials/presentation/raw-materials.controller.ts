import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { IRawMaterialRepository } from '../domain/repositories/raw-material.repository.interface';
import { saveRawMaterialSchema, setRawMaterialActiveSchema } from './raw-material.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * REQ-5/REQ-7 (`specs/0007-cadastro-produtos`) — catálogo de matéria-prima do restaurante do
 * operador logado, rota de retaguarda (mesmo padrão de `restaurantOperatorMiddleware` de
 * `specs/0010`).
 */
export class RawMaterialsController extends BaseRouter {
  constructor(
    private readonly rawMaterialRepository: IRawMaterialRepository,
    private readonly productRepository: IProductRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const authenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.restaurantOperatorMiddleware];

    application.get('/restaurants/me/raw-materials', ...authenticated, async (req: Request, res: Response) => {
      const materials = await this.rawMaterialRepository.listByRestaurant(req.restaurantId!);
      res.json(200, materials);
    });

    application.post('/restaurants/me/raw-materials', ...authenticated, async (req: Request, res: Response) => {
      const { name, priceDelta } = parseBody(saveRawMaterialSchema, req.body);
      const material = await this.rawMaterialRepository.create(req.restaurantId!, name, priceDelta);
      res.json(201, material);
    });

    application.put('/restaurants/me/raw-materials/:id', ...authenticated, async (req: Request, res: Response) => {
      const { name, priceDelta } = parseBody(saveRawMaterialSchema, req.body);
      await this.findOwnedRawMaterial(req.params.id, req.restaurantId!);
      const material = await this.rawMaterialRepository.update(req.params.id, name, priceDelta);
      res.json(200, material);
    });

    // REQ-7: desativar (isActive: false) sem `confirmed` retorna 409 com os produtos afetados,
    // sem aplicar nada — a retaguarda mostra o aviso e só chama de novo (com `confirmed: true`)
    // se o operador confirmar mesmo assim. Ativar (isActive: true) nunca precisa de confirmação.
    application.patch(
      '/restaurants/me/raw-materials/:id/active',
      ...authenticated,
      async (req: Request, res: Response) => {
        const { isActive, confirmed } = parseBody(setRawMaterialActiveSchema, req.body);
        const material = await this.findOwnedRawMaterial(req.params.id, req.restaurantId!);

        if (!isActive && !confirmed) {
          const affectedProducts = await this.productRepository.findActiveByRawMaterialId(
            req.restaurantId!,
            material.id,
          );
          if (affectedProducts.length > 0) {
            res.json(409, { requiresConfirmation: true, affectedProducts });
            return;
          }
        }

        const updated = await this.rawMaterialRepository.setActive(req.params.id, isActive);
        res.json(200, updated);
      },
    );
  }

  private async findOwnedRawMaterial(id: string, restaurantId: string) {
    const material = await this.rawMaterialRepository.findById(id);
    if (!material || material.restaurantId !== restaurantId) {
      throw new NotFoundError('Matéria-prima não encontrada');
    }
    return material;
  }
}
