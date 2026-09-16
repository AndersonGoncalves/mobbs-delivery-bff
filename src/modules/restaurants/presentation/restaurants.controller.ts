import type { Request, Response, Server } from 'restify';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IRestaurantRepository } from '../domain/repositories/restaurant.repository.interface';
import {
  restaurantProfileSchema,
  businessHoursSchema,
  setActiveSchema,
  updateSlugSchema,
} from './restaurants.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * `/restaurants/resolve/:slug` é público (specs/0009-resolucao-restaurante REQ-1) — usado antes
 * do cliente logar/resolver o restaurante, nos dois canais (web e nativo). As demais rotas
 * (`/restaurants/me/...`, specs/0010-configuracao-restaurante) passam por
 * `firebaseAuthMiddleware` + `restaurantOperatorMiddleware` (injetado por fora, ver `main.ts`)
 * antes do handler de negócio.
 *
 * Todo handler/middleware da chain é `async (req, res)`, sem `next` — Restify exige essa
 * assinatura pra handlers assíncronos (sem exceção pra middlewares no meio da chain): a Promise
 * retornada já faz o papel de `next()`/`next(error)` automaticamente (erro lançado ->
 * `next(error)`, resolve normal -> `next()`), confirmado rodando o BFF de verdade — arity 3 (com
 * `next`) e `async` juntos lançam `AssertionError` na inicialização do servidor
 * (`node_modules/restify/lib/chain.js`).
 */
export class RestaurantsController extends BaseRouter {
  constructor(
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.get('/restaurants/resolve/:slug', async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findBySlug(req.params.slug);
      const resolved = this.render(restaurant && restaurant.isActive ? restaurant : null);
      res.json(200, resolved);
    });

    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-10 — pública (igual a `/resolve/:slug`):
    // o app precisa calcular a taxa antes/durante o checkout, sem sessão de operador nenhuma.
    // 404 só quando o restaurante não existe; bairro sem zona cadastrada (ou modo `fixed`) volta
    // 200 com `feeCents: null` — casos diferentes, o app trata cada um com uma mensagem própria.
    application.get('/restaurants/:id/delivery-fee', async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.params.id);
      this.render(restaurant);
      const neighborhood = String(req.query.neighborhood ?? '');
      const zone = restaurant!.deliveryFeeZones.find((z) => z.neighborhood.toLowerCase() === neighborhood.toLowerCase());
      res.json(200, { feeCents: zone?.feeCents ?? null });
    });

    const authenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.restaurantOperatorMiddleware];

    application.get('/restaurants/me', ...authenticated, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.restaurantId!);
      res.json(200, this.render(restaurant));
    });

    application.put('/restaurants/me', ...authenticated, async (req: Request, res: Response) => {
      const patch = parseBody(restaurantProfileSchema, req.body);
      const restaurant = await this.restaurantRepository.updateProfile(req.restaurantId!, patch);
      res.json(200, restaurant);
    });

    application.put(
      '/restaurants/me/business-hours',
      ...authenticated,
      async (req: Request, res: Response) => {
        const businessHours = parseBody(businessHoursSchema, req.body);
        const restaurant = await this.restaurantRepository.updateBusinessHours(req.restaurantId!, businessHours);
        res.json(200, restaurant);
      },
    );

    application.patch('/restaurants/me/active', ...authenticated, async (req: Request, res: Response) => {
      const { isActive } = parseBody(setActiveSchema, req.body);
      const restaurant = await this.restaurantRepository.setActive(req.restaurantId!, isActive);
      res.json(200, restaurant);
    });

    application.get('/restaurants/me/onboarding', ...authenticated, async (req: Request, res: Response) => {
      const restaurant = await this.restaurantRepository.findById(req.restaurantId!);
      const found = this.render(restaurant);
      res.json(200, {
        slug: found.slug,
        webUrl: `https://${found.slug}.bsdelivery.com.br`,
        nativeLink: `https://bsdelivery.com.br/r/${found.slug}`,
      });
    });

    application.put('/restaurants/me/slug', ...authenticated, async (req: Request, res: Response) => {
      const { slug } = parseBody(updateSlugSchema, req.body);
      const restaurant = await this.restaurantRepository.updateSlug(req.restaurantId!, slug);
      res.json(200, restaurant);
    });
  }
}
