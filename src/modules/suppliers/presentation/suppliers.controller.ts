import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { ISupplierRepository } from '../domain/repositories/supplier.repository.interface';
import { saveSupplierSchema, setSupplierActiveSchema } from './supplier.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0015-estoque-compras REQ-1 — fornecedores do restaurante do operador logado, mesmo
 * padrão de isolamento `restaurants.me.*` já usado em `raw-materials`/`financeiro`.
 */
export class SuppliersController extends BaseRouter {
  constructor(
    private readonly supplierRepository: ISupplierRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    // specs/0021-papeis-operador REQ-3/T005 — fornecedores (compras) é `dono`/`gerente`.
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    // AC-1
    application.get('/restaurants/me/suppliers', ...authenticated, async (req: Request, res: Response) => {
      const suppliers = await this.supplierRepository.listByRestaurant(req.restaurantId!);
      res.json(200, suppliers);
    });

    // AC-1
    application.post('/restaurants/me/suppliers', ...authenticated, async (req: Request, res: Response) => {
      const payload = parseBody(saveSupplierSchema, req.body);
      const supplier = await this.supplierRepository.create(req.restaurantId!, payload);
      res.json(201, supplier);
    });

    // REQ-1 (editar)
    application.put('/restaurants/me/suppliers/:id', ...authenticated, async (req: Request, res: Response) => {
      const payload = parseBody(saveSupplierSchema, req.body);
      await this.findOwnedSupplier(req.params.id, req.restaurantId!);
      const supplier = await this.supplierRepository.update(req.params.id, payload);
      res.json(200, supplier);
    });

    // REQ-1 (desativar)
    application.patch(
      '/restaurants/me/suppliers/:id/active',
      ...authenticated,
      async (req: Request, res: Response) => {
        const { isActive } = parseBody(setSupplierActiveSchema, req.body);
        await this.findOwnedSupplier(req.params.id, req.restaurantId!);
        const supplier = await this.supplierRepository.setActive(req.params.id, isActive);
        res.json(200, supplier);
      },
    );
  }

  private async findOwnedSupplier(id: string, restaurantId: string) {
    const supplier = await this.supplierRepository.findById(id);
    if (!supplier || supplier.restaurantId !== restaurantId) {
      throw new NotFoundError('Fornecedor não encontrado');
    }
    return supplier;
  }
}
