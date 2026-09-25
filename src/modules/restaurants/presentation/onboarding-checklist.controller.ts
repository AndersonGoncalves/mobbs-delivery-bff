import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IRestaurantRepository } from '../domain/repositories/restaurant.repository.interface';
import { IMenuCategoryRepository } from '../../catalog/domain/repositories/menu-category.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0039-onboarding-primeiro-acesso REQ-3/REQ-4/REQ-5 — checklist sempre derivado do estado
 * real (sem flag "onboarding concluído" persistida): cada item reflete uma condição que já
 * existe em algum lugar do restaurante, então mesmo um restaurante criado fora do autocadastro
 * (seed manual, por exemplo) recebe um checklist coerente com o que ele realmente tem.
 */
export class OnboardingChecklistController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly menuCategoryRepository: IMenuCategoryRepository,
    private readonly productRepository: IProductRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const authenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.restaurantOperatorMiddleware];

    application.get('/restaurants/me/onboarding-checklist', ...authenticated, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.restaurantId!);
      const found = this.render(restaurant);

      const [categories, products] = await Promise.all([
        this.menuCategoryRepository.listByRestaurant(req.restaurantId!),
        this.productRepository.listByRestaurant(req.restaurantId!),
      ]);

      const items = [
        { key: 'profile', done: !!found.address },
        { key: 'catalog', done: categories.length > 0 && products.length > 0 },
        { key: 'businessHours', done: !!found.businessHoursReviewedAt },
        { key: 'pix', done: !!found.pixKey },
        // specs/0070 — WhatsApp conectado é o que envia as mensagens automáticas pro cliente; e o
        // app do cliente é considerado personalizado quando tem logo ou cor primária (nenhum dos
        // dois nasce preenchido no autocadastro).
        { key: 'whatsapp', done: !!found.whatsappConnected },
        { key: 'customerApp', done: !!found.logoUrl || !!found.primaryColor },
      ];

      res.json(200, { items, allDone: items.every((item) => item.done) });
    });
  }
}
