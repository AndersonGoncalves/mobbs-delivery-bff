import type { Request, Response, Server } from 'restify';
import { ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { findConflictingProductIds } from '../domain/find-conflicting-product-ids';
import { IPromotion } from '../domain/entities/promotion.entity';
import { IPromotionRepository } from '../domain/repositories/promotion.repository.interface';
import { savePromotionSchema, setPromotionActiveSchema } from './promotions.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0044-promocoes-produtos — gestão de promoções pela retaguarda (`/restaurants/me/promotions`,
 * mesmo padrão `restaurantOperatorMiddleware` de `CouponsController`); `dono`/`gerente`, mesmo
 * grupo de papel de cupons/cardápio (`specs/0021-papeis-operador` REQ-3).
 */
export class PromotionsController extends BaseRouter {
  constructor(
    private readonly promotionRepository: IPromotionRepository,
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

    // AC-1
    application.get('/restaurants/me/promotions', ...authenticated, async (req: Request, res: Response) => {
      const promotions = await this.promotionRepository.findByRestaurantId(req.restaurantId!);
      res.json(200, promotions);
    });

    // AC-1/AC-5
    application.post('/restaurants/me/promotions', ...authenticated, async (req: Request, res: Response) => {
      const payload = parseBody(savePromotionSchema, req.body);
      if (payload.isActive) await this.assertNoConflict(req.restaurantId!, payload.productIds);
      const promotion = await this.promotionRepository.create(req.restaurantId!, payload);
      res.json(201, promotion);
    });

    // REQ-1/AC-5 (editar — `isActive` faz parte do mesmo corpo, mesmo padrão de cupons).
    application.put('/restaurants/me/promotions/:id', ...authenticated, async (req: Request, res: Response) => {
      const payload = parseBody(savePromotionSchema, req.body);
      await this.findOwnedPromotion(req.params.id, req.restaurantId!);
      if (payload.isActive) await this.assertNoConflict(req.restaurantId!, payload.productIds, req.params.id);
      const promotion = await this.promotionRepository.update(req.params.id, payload);
      res.json(200, promotion);
    });

    // REQ-6/AC-5 — reativar uma promoção antes inativa também precisa da checagem de conflito
    // (a promoção pode ter sido criada inativa, ou desativada e agora reativada depois de outra
    // promoção já ter assumido algum dos mesmos produtos nesse meio-tempo).
    application.patch('/restaurants/me/promotions/:id/active', ...authenticated, async (req: Request, res: Response) => {
      const { isActive } = parseBody(setPromotionActiveSchema, req.body);
      const existing = await this.findOwnedPromotion(req.params.id, req.restaurantId!);
      if (isActive) await this.assertNoConflict(req.restaurantId!, existing.productIds, req.params.id);
      const promotion = await this.promotionRepository.setActive(req.params.id, isActive);
      res.json(200, promotion);
    });
  }

  /** REQ-1/AC-5 — `excludePromotionId` evita a promoção conflitar com ela mesma ao editar/reativar. */
  private async assertNoConflict(restaurantId: string, productIds: string[], excludePromotionId?: string): Promise<void> {
    const activePromotions = await this.promotionRepository.findActiveByRestaurantId(restaurantId);
    const otherActivePromotions = activePromotions.filter((promotion) => promotion.id !== excludePromotionId);
    const conflicting = findConflictingProductIds(productIds, otherActivePromotions);
    if (conflicting.length > 0) {
      throw new ConflictError(`Produto(s) já em outra promoção ativa: ${conflicting.join(', ')}`);
    }
  }

  private async findOwnedPromotion(id: string, restaurantId: string): Promise<IPromotion> {
    const promotion = await this.promotionRepository.findById(id);
    if (!promotion || promotion.restaurantId !== restaurantId) {
      throw new NotFoundError('Promoção não encontrada');
    }
    return promotion;
  }
}
