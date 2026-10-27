import type { Request, Response, Server } from 'restify';
import { ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { parseBody } from '../../../shared/http/validate';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IResellerRepository } from '../domain/repositories/reseller.repository.interface';
import { IResellerProspectRepository } from '../domain/repositories/reseller-prospect.repository.interface';
import { IResellerClientRepository } from '../domain/repositories/reseller-client.repository.interface';
import { convertProspectSchema, resellerProspectInputSchema } from './resellers.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

const REFERRAL_LINK_BASE = 'https://bsdelivery.com.br/gratis?revenda=';
const CONVERTIBLE_RESTAURANTS_LIMIT = 20;

/**
 * specs/0189-painel-revenda — painel do revendedor logado (`revenda.bsdelivery.com.br`). Todas as
 * rotas isolam por `req.resellerId` (nunca por parâmetro de rota) — mesmo padrão multi-tenant de
 * `/restaurants/me/...`.
 */
export class ResellerController extends BaseRouter {
  constructor(
    private readonly resellerRepository: IResellerRepository,
    private readonly prospectRepository: IResellerProspectRepository,
    private readonly clientRepository: IResellerClientRepository,
    private readonly restaurantRepository: IRestaurantRepository,
    private readonly resellerMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const authenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.resellerMiddleware];

    // REQ-9 — dados do revendedor + link de indicação pronto.
    application.get('/reseller/me', ...authenticated, async (req: Request, res: Response) => {
      const reseller = await this.resellerRepository.findById(req.resellerId!);
      if (!reseller) throw new NotFoundError('Revendedor não encontrado');
      res.json(200, { ...reseller, referralLink: `${REFERRAL_LINK_BASE}${reseller.code}` });
    });

    // REQ-5.
    application.get('/reseller/me/prospects', ...authenticated, async (req: Request, res: Response) => {
      const prospects = await this.prospectRepository.listByReseller(req.resellerId!);
      res.json(200, prospects);
    });

    // REQ-6.
    application.post('/reseller/me/prospects', ...authenticated, async (req: Request, res: Response) => {
      const input = parseBody(resellerProspectInputSchema, req.body);
      const prospect = await this.prospectRepository.create({ resellerId: req.resellerId!, ...input });
      res.json(201, prospect);
    });

    // plan.md decisão 2 — só enquanto `em_prospeccao`.
    application.patch('/reseller/me/prospects/:id', ...authenticated, async (req: Request, res: Response) => {
      const input = parseBody(resellerProspectInputSchema, req.body);
      const updated = await this.prospectRepository.update(req.params.id, req.resellerId!, input);
      if (!updated) throw new NotFoundError('Prospect não encontrado, ou já convertido (não pode mais ser editado)');
      res.json(200, updated);
    });

    application.del('/reseller/me/prospects/:id', ...authenticated, async (req: Request, res: Response) => {
      const deleted = await this.prospectRepository.delete(req.params.id, req.resellerId!);
      if (!deleted) throw new NotFoundError('Prospect não encontrado, ou já convertido (não pode mais ser excluído)');
      res.send(204);
    });

    // REQ-7 — clientes efetivados, com o nome do restaurante resolvido.
    application.get('/reseller/me/clients', ...authenticated, async (req: Request, res: Response) => {
      const clients = await this.clientRepository.listByReseller(req.resellerId!);
      const restaurants = await Promise.all(clients.map((client) => this.restaurantRepository.findById(client.restaurantId)));
      res.json(200, clients.map((client, index) => ({
        id: client.id,
        restaurantId: client.restaurantId,
        restaurantName: restaurants[index]?.name ?? null,
        origin: client.origin,
        createdAt: client.createdAt,
      })));
    });

    // REQ-8 — restaurantes ainda sem revendedor, pra escolher na conversão manual.
    application.get('/reseller/me/convertible-restaurants', ...authenticated, async (req: Request, res: Response) => {
      const search = typeof req.query?.search === 'string' ? req.query.search.trim().toLowerCase() : '';
      const [all, claimedIds] = await Promise.all([
        this.restaurantRepository.listAll(),
        this.clientRepository.listClaimedRestaurantIds(),
      ]);
      const available = all
        .filter((restaurant) => !claimedIds.has(restaurant.id))
        .filter((restaurant) => !search || restaurant.name.toLowerCase().includes(search))
        .slice(0, CONVERTIBLE_RESTAURANTS_LIMIT);
      res.json(200, available.map((restaurant) => ({ id: restaurant.id, name: restaurant.name })));
    });

    // REQ-8 — marca o prospect como convertido e cria o vínculo de cliente efetivado (origem
    // `manual`); 409 se o restaurante escolhido já tiver outro revendedor (plan.md decisão 3).
    application.patch('/reseller/me/prospects/:id/convert', ...authenticated, async (req: Request, res: Response) => {
      const { restaurantId } = parseBody(convertProspectSchema, req.body);
      const restaurant = await this.restaurantRepository.findById(restaurantId);
      if (!restaurant) throw new NotFoundError('Restaurante não encontrado');

      const existingClient = await this.clientRepository.findByRestaurantId(restaurantId);
      if (existingClient) {
        throw existingClient.resellerId === req.resellerId!
          ? new ConflictError('Este restaurante já é cliente efetivado seu')
          : new ConflictError('Este restaurante já é cliente efetivado de outro revendedor');
      }

      const prospect = await this.prospectRepository.markConverted(req.params.id, req.resellerId!, restaurantId);
      if (!prospect) throw new NotFoundError('Prospect não encontrado, ou já convertido');

      const client = await this.clientRepository.create({ resellerId: req.resellerId!, restaurantId, origin: 'manual' });
      res.json(200, { prospect, client });
    });
  }
}
