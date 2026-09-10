import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { IRawMaterialRepository } from '../domain/repositories/raw-material.repository.interface';
import { IStockMovementRepository } from '../domain/repositories/stock-movement.repository.interface';
import { saveRawMaterialSchema, setRawMaterialActiveSchema, stockAdjustmentSchema } from './raw-material.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * REQ-5/REQ-7 (`specs/0007-cadastro-produtos`) — catálogo de matéria-prima do restaurante do
 * operador logado, rota de retaguarda (mesmo padrão de `restaurantOperatorMiddleware` de
 * `specs/0010`).
 *
 * Ampliado por `specs/0015-estoque-compras` REQ-5/REQ-6 (ajuste manual de estoque + histórico de
 * movimentações) — mesmo módulo, não um módulo `stock` separado (a movimentação sempre se refere
 * a um `RawMaterial` deste catálogo, ver "Notas de implementação" em
 * `specs/0015-estoque-compras/tasks.md`).
 */
export class RawMaterialsController extends BaseRouter {
  constructor(
    private readonly rawMaterialRepository: IRawMaterialRepository,
    private readonly productRepository: IProductRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
    private readonly stockMovementRepository: IStockMovementRepository,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    // specs/0021-papeis-operador REQ-3/T005 — estoque/matéria-prima é `dono`/`gerente`.
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    application.get('/restaurants/me/raw-materials', ...authenticated, async (req: Request, res: Response) => {
      const materials = await this.rawMaterialRepository.listByRestaurant(req.restaurantId!);
      res.json(200, materials);
    });

    application.post('/restaurants/me/raw-materials', ...authenticated, async (req: Request, res: Response) => {
      const { name, priceDelta, unit, minimumStockAlert } = parseBody(saveRawMaterialSchema, req.body);
      const material = await this.rawMaterialRepository.create(req.restaurantId!, name, priceDelta, unit, minimumStockAlert);
      res.json(201, material);
    });

    application.put('/restaurants/me/raw-materials/:id', ...authenticated, async (req: Request, res: Response) => {
      const { name, priceDelta, unit, minimumStockAlert } = parseBody(saveRawMaterialSchema, req.body);
      await this.findOwnedRawMaterial(req.params.id, req.restaurantId!);
      const material = await this.rawMaterialRepository.update(req.params.id, name, priceDelta, unit, minimumStockAlert);
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

    // specs/0015-estoque-compras REQ-5/AC-5 — ajuste manual (entrada ou saída, com motivo),
    // independente de um `PurchaseOrder`. `type` grava o sentido do movimento direto (não
    // `ajuste`, ver nota em `stock-movement.entity.ts`).
    application.post(
      '/restaurants/me/raw-materials/:id/stock-adjustment',
      ...authenticated,
      async (req: Request, res: Response) => {
        const { type, quantity, reason } = parseBody(stockAdjustmentSchema, req.body);
        const material = await this.findOwnedRawMaterial(req.params.id, req.restaurantId!);

        const delta = type === 'entrada' ? quantity : -quantity;
        const [updatedMaterial, movement] = await Promise.all([
          this.rawMaterialRepository.incrementStock(material.id, delta),
          this.stockMovementRepository.create({
            restaurantId: req.restaurantId!,
            rawMaterialId: material.id,
            type,
            quantity,
            reason,
            createdBy: req.user?.uid,
          }),
        ]);
        res.json(201, { rawMaterial: updatedMaterial, movement });
      },
    );

    // specs/0015-estoque-compras REQ-6/AC-6 — histórico cronológico (mais antiga primeiro).
    application.get(
      '/restaurants/me/raw-materials/:id/movements',
      ...authenticated,
      async (req: Request, res: Response) => {
        await this.findOwnedRawMaterial(req.params.id, req.restaurantId!);
        const movements = await this.stockMovementRepository.listByRawMaterial(req.params.id);
        res.json(200, movements);
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
