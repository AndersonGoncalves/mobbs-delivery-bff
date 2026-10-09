import type { Request, Response, Server } from 'restify';
import { InternalServerError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { findProspectCategory } from '../domain/prospect-categories';
import { IProspectRepository } from '../domain/repositories/prospect.repository.interface';
import { IPlacesSearchService } from '../domain/services/i-places-search.service';
import { listProspectsQuerySchema, saveProspectsSchema, searchProspectsQuerySchema } from './prospects.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * specs/0123-prospeccao-restaurantes-google-maps — painel da plataforma, protegido por
 * `platformAdminMiddleware` (REQ-1, mesmo padrão de `PlatformController`). Rotas sob
 * `/platform/prospects*`, nunca `/restaurants/me/*` — não é um recurso de restaurante cliente.
 */
export class ProspectsController extends BaseRouter {
  constructor(
    private readonly placesSearchService: IPlacesSearchService,
    private readonly prospectRepository: IProspectRepository,
    private readonly platformAdminMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const adminAuthenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.platformAdminMiddleware];

    // REQ-5 — busca na Google Places API; não salva nada ainda (salvar é REQ-6, rota própria).
    application.get('/platform/prospects/search', ...adminAuthenticated, async (req: Request, res: Response) => {
      const query = parseBody(searchProspectsQuerySchema, req.query);
      const category = findProspectCategory(query.category)!; // já validado pelo enum do schema
      try {
        const results = await this.placesSearchService.searchNearby({
          latitude: query.latitude,
          longitude: query.longitude,
          radiusMeters: query.radiusMeters,
          placesType: category.placesType,
        });
        res.json(200, results);
      } catch (error) {
        // REQ-8 — chave ausente ou falha da API da Google: aviso claro, nunca derruba o painel.
        throw new InternalServerError(error instanceof Error ? error.message : 'Falha ao buscar na Google Places API');
      }
    });

    // REQ-6/REQ-9 — salva os selecionados; ignora (não duplica) quem já existe por placeId.
    application.post('/platform/prospects', ...adminAuthenticated, async (req: Request, res: Response) => {
      const { items } = parseBody(saveProspectsSchema, req.body);
      const saved = [];
      for (const item of items) {
        const existing = await this.prospectRepository.findByPlaceId(item.placeId);
        saved.push(existing ?? (await this.prospectRepository.create(item)));
      }
      res.json(201, saved);
    });

    // REQ-7 — lista os já salvos, opcionalmente filtrados por ramo.
    application.get('/platform/prospects', ...adminAuthenticated, async (req: Request, res: Response) => {
      const { category } = parseBody(listProspectsQuerySchema, req.query);
      const prospects = await this.prospectRepository.listAll(category);
      res.json(200, prospects);
    });
  }
}
