import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { validateCoupon } from '../domain/services/coupon-validator';
import { ICoupon } from '../domain/entities/coupon.entity';
import { CouponInput, ICouponRepository } from '../domain/repositories/coupon.repository.interface';
import { SaveCouponPayload, saveCouponSchema, validateCouponSchema } from './coupons.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0022-cupons-desconto — REQ-1/REQ-5: gestão de cupons pela retaguarda
 * (`/restaurants/me/coupons`, mesmo padrão `restaurantOperatorMiddleware` de
 * `AccountsPayableController`/`SuppliersController`). REQ-2/REQ-3/REQ-6: validação pelo
 * cliente no checkout (`/restaurants/:id/coupons/validate`) — **sem** `restaurantOperatorMiddleware`
 * (o cliente não é operador de restaurante nenhum), `restaurantId` vem do path (mesmo padrão de
 * `CatalogController.GET /restaurants/:id/menu-categories`: leitura pública por qualquer
 * `Customer` autenticado, escopada pelo restaurante já resolvido no app, nunca pela identidade
 * de quem chama) — desvio do path literal de `plan.md` (`/restaurants/me/coupons/validate`), que
 * conflitava com o resto do próprio plano ("não operador"); `/restaurants/me/...` no resto do BFF
 * sempre significa "restaurante do operador logado" (`req.restaurantId`, via
 * `restaurantOperatorMiddleware`), que não existe pra um `Customer`.
 *
 * specs/0021-papeis-operador REQ-3/T005 (mesclado depois desta spec ser escrita, ver `plan.md`:
 * "requireOperatorRole(...) se specs/0021 já estiver implementada") — gestão de cupons é
 * `dono`/`gerente`, mesmo grupo de `SuppliersController`/`PurchaseOrdersController` (cardápio/
 * estoque/compras/pedidos). A rota de validação do cliente não leva `requireOperatorRole` — quem
 * chama não é operador nenhum.
 */
export class CouponsController extends BaseRouter {
  constructor(
    private readonly couponRepository: ICouponRepository,
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

    // AC-1/AC-5 — lista com `usageCount` atual (REQ-5), mais recente primeiro.
    application.get('/restaurants/me/coupons', ...authenticated, async (req: Request, res: Response) => {
      const coupons = await this.couponRepository.findManyByRestaurant(req.restaurantId!);
      res.json(200, coupons);
    });

    // AC-1
    application.post('/restaurants/me/coupons', ...authenticated, async (req: Request, res: Response) => {
      const payload = this.normalizeInput(parseBody(saveCouponSchema, req.body));
      const coupon = await this.couponRepository.create(req.restaurantId!, payload);
      res.json(201, coupon);
    });

    // REQ-1 (editar/desativar — `isActive` faz parte do mesmo corpo, ver `coupons.schemas.ts`).
    application.put('/restaurants/me/coupons/:id', ...authenticated, async (req: Request, res: Response) => {
      const payload = this.normalizeInput(parseBody(saveCouponSchema, req.body));
      await this.findOwnedCoupon(req.params.id, req.restaurantId!);
      const coupon = await this.couponRepository.update(req.params.id, payload);
      res.json(200, coupon);
    });

    // REQ-2/REQ-3/REQ-6 — feedback de UX antes de "Revisar pedido"; **não** incrementa
    // `usageCount` (só `POST /orders`, na criação de fato, REQ-4) e **não** é a fonte de verdade
    // (`OrdersController` revalida tudo de novo ao criar o pedido).
    application.post(
      '/restaurants/:id/coupons/validate',
      firebaseAuthMiddleware,
      async (req: Request, res: Response) => {
        const { code, orderSubtotal } = parseBody(validateCouponSchema, req.body);
        const result = await this.validate(req.params.id, req.user!.uid, code, orderSubtotal);
        res.json(200, result);
      },
    );
  }

  /**
   * Resolve o cupom + contagem de uso do cliente e delega pra `validateCoupon` (domínio puro) —
   * reaproveitado por `CouponsController.validate` (feedback de UX) e por
   * `OrdersController`/`POST /orders` (revalidação server-side, REQ-4), pra nunca duplicar a
   * lógica de resolução de dependências entre as duas chamadas.
   */
  async validate(restaurantId: string, customerId: string, code: string, orderSubtotal: number) {
    const normalizedCode = code.trim().toUpperCase();
    const coupon: ICoupon | null = await this.couponRepository.findByCode(restaurantId, normalizedCode);
    const customerUsageCount = coupon
      ? await this.orderRepository.countByCustomerAndCoupon(restaurantId, customerId, coupon.code)
      : 0;

    return validateCoupon({ coupon, orderSubtotal, now: new Date(), customerUsageCount });
  }

  /** `code` normalizado aqui (trim + uppercase) — ver comentário em `coupons.schemas.ts`. */
  private normalizeInput(payload: SaveCouponPayload): CouponInput {
    return { ...payload, code: payload.code.trim().toUpperCase() };
  }

  private async findOwnedCoupon(id: string, restaurantId: string): Promise<ICoupon> {
    const coupon = await this.couponRepository.findById(id);
    if (!coupon || coupon.restaurantId !== restaurantId) {
      throw new NotFoundError('Cupom não encontrado');
    }
    return coupon;
  }
}
