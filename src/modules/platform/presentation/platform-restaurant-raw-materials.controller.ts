import type { Request, Response, Server } from 'restify';
import { ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IRawMaterial } from '../../raw-materials/domain/entities/raw-material.entity';
import { IRawMaterialRepository } from '../../raw-materials/domain/repositories/raw-material.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import {
  listRawMaterialsQuerySchema,
  saveRawMaterialSchema,
  setRawMaterialActiveSchema,
} from '../../raw-materials/presentation/raw-material.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * Pedido explícito do usuário (18/11/2026, 4ª leva) — "Matéria-prima" no menu "⋮" de
 * `PlatformRestaurantsPage`: mesmo raciocínio de `PlatformRestaurantProductsController` —
 * reaproveita o MESMO repositório/regras de `RawMaterialsController` (nunca duplica
 * validação/regra de negócio), só muda de onde vem o `restaurantId` (`:id` da URL, não a sessão)
 * e quem pode chamar.
 *
 * Diferente de Produtos, a exclusão real AQUI é simples de reaproveitar (uma única checagem de
 * uso — `countAnyByRawMaterialId` — sem as buscas adicionais de pedidos/templates que o delete de
 * produto tem) — por isso o admin ganha `DELETE` de verdade, mesma regra do dono (bloqueado se já
 * usada em algum produto). Sem rota de ajuste de estoque/histórico de movimentações — fora do
 * pedido ("cadastro de matéria-prima"), mesmo corte de escopo de Produtos com "cadastro de
 * produtos" (sem adicionais).
 */
export class PlatformRestaurantRawMaterialsController extends BaseRouter {
  constructor(
    private readonly rawMaterialRepository: IRawMaterialRepository,
    private readonly productRepository: IProductRepository,
    private readonly platformAdminMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const adminAuthenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.platformAdminMiddleware];

    application.get('/platform/restaurants/:id/raw-materials', ...adminAuthenticated, async (req: Request, res: Response) => {
      const query = parseBody(listRawMaterialsQuerySchema, req.query ?? {});
      const materials = await this.rawMaterialRepository.listByRestaurant(req.params.id, {
        name: query.name,
        isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
      });
      res.json(200, materials);
    });

    application.post('/platform/restaurants/:id/raw-materials', ...adminAuthenticated, async (req: Request, res: Response) => {
      const { name, priceDelta, unit, minimumStockAlert, description, tracksStock, imageUrl } = parseBody(saveRawMaterialSchema, req.body);
      const material = tracksStock === undefined
        ? await this.rawMaterialRepository.create(req.params.id, name, priceDelta, unit, minimumStockAlert, description, undefined, imageUrl)
        : await this.rawMaterialRepository.create(req.params.id, name, priceDelta, unit, minimumStockAlert, description, tracksStock, imageUrl);
      res.json(201, material);
    });

    application.put('/platform/restaurants/:id/raw-materials/:materialId', ...adminAuthenticated, async (req: Request, res: Response) => {
      const { name, priceDelta, unit, minimumStockAlert, description, tracksStock, imageUrl } = parseBody(saveRawMaterialSchema, req.body);
      await this.findOwnedRawMaterial(req.params.materialId, req.params.id);
      const material = tracksStock === undefined
        ? await this.rawMaterialRepository.update(req.params.materialId, name, priceDelta, unit, minimumStockAlert, description, undefined, imageUrl)
        : await this.rawMaterialRepository.update(req.params.materialId, name, priceDelta, unit, minimumStockAlert, description, tracksStock, imageUrl);
      res.json(200, material);
    });

    application.patch(
      '/platform/restaurants/:id/raw-materials/:materialId/active',
      ...adminAuthenticated,
      async (req: Request, res: Response) => {
        const { isActive, confirmed } = parseBody(setRawMaterialActiveSchema, req.body);
        const material = await this.findOwnedRawMaterial(req.params.materialId, req.params.id);

        if (!isActive && !confirmed) {
          const affectedProducts = await this.productRepository.findActiveByRawMaterialId(req.params.id, material.id);
          if (affectedProducts.length > 0) {
            res.json(409, { requiresConfirmation: true, affectedProducts });
            return;
          }
        }

        const updated = await this.rawMaterialRepository.setActive(req.params.materialId, isActive);
        res.json(200, updated);
      },
    );

    application.del('/platform/restaurants/:id/raw-materials/:materialId', ...adminAuthenticated, async (req: Request, res: Response) => {
      const material = await this.findOwnedRawMaterial(req.params.materialId, req.params.id);
      const usageCount = await this.productRepository.countAnyByRawMaterialId(req.params.id, material.id);
      if (usageCount > 0) {
        throw new ConflictError('Matéria-prima já foi usada em algum produto e não pode ser excluída');
      }
      await this.rawMaterialRepository.remove(material.id);
      res.send(204);
    });
  }

  private async findOwnedRawMaterial(id: string, restaurantId: string): Promise<IRawMaterial> {
    const material = await this.rawMaterialRepository.findById(id);
    if (!material || material.restaurantId !== restaurantId) {
      throw new NotFoundError('Matéria-prima não encontrada');
    }
    return material;
  }
}
