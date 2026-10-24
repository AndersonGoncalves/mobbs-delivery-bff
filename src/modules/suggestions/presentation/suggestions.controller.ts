import type { Request, Response, Server } from 'restify';
import { BadRequestError, ConflictError, NotFoundError } from 'restify-errors';
import { BaseRouter } from '../../../shared/router/base.router';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { parseBody } from '../../../shared/http/validate';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { ISuggestionRepository } from '../domain/suggestion';
import {
  createSuggestionSchema, listSuggestionsSchema, readSuggestionSchema, suggestionIdSchema, updateSuggestionSchema,
} from './suggestions.schemas';

type Handler = (req: Request, res: Response) => Promise<void>;

export class SuggestionsController extends BaseRouter {
  constructor(
    private readonly repository: ISuggestionRepository,
    private readonly restaurants: IRestaurantRepository,
    private readonly operatorMiddleware: Handler,
    private readonly platformMiddleware: Handler,
  ) { super(); }

  initializeRoutes(app: Server): void {
    const operator = [firebaseAuthMiddleware, this.operatorMiddleware];
    const platform = [firebaseAuthMiddleware, this.platformMiddleware];

    app.get('/restaurants/me/suggestions/unread', ...operator, async (req: Request, res: Response) => {
      res.json(200, { count: await this.repository.unreadCount(req.restaurantId!, req.operatorId!) });
    });
    app.get('/restaurants/me/suggestions', ...operator, async (req: Request, res: Response) => {
      const filter = parseBody(listSuggestionsSchema, req.query);
      res.json(200, await this.repository.list({ ...filter, restaurantId: req.restaurantId!, operatorId: req.operatorId! }));
    });
    app.post('/restaurants/me/suggestions', ...operator, async (req: Request, res: Response) => {
      const payload = parseBody(createSuggestionSchema, req.body);
      const restaurant = this.render(await this.restaurants.findById(req.restaurantId!));
      res.json(201, await this.repository.create({
        ...payload, restaurantId: req.restaurantId!, restaurantName: restaurant.name, authorEmail: req.user!.email!,
      }));
    });
    app.get('/restaurants/me/suggestions/:id', ...operator, async (req: Request, res: Response) => {
      res.json(200, await this.find(req));
    });
    app.post('/restaurants/me/suggestions/:id/read', ...operator, async (req: Request, res: Response) => {
      const { revision } = parseBody(readSuggestionSchema, req.body);
      const suggestion = await this.find(req);
      if (revision > suggestion.revision) throw new BadRequestError('Revisão de leitura inválida');
      await this.repository.markRead(suggestion.id, req.operatorId!, revision);
      res.send(204);
    });
    app.get('/platform/suggestions', ...platform, async (req: Request, res: Response) => {
      res.json(200, await this.repository.list(parseBody(listSuggestionsSchema, req.query)));
    });
    app.get('/platform/suggestions/:id', ...platform, async (req: Request, res: Response) => {
      res.json(200, await this.find(req, true));
    });
    app.patch('/platform/suggestions/:id', ...platform, async (req: Request, res: Response) => {
      const payload = parseBody(updateSuggestionSchema, req.body);
      const suggestion = await this.find(req, true);
      if (payload.revision !== suggestion.revision) {
        throw new ConflictError('Esta sugestão foi atualizada. Recarregue os detalhes antes de salvar.');
      }
      if (!payload.reply && payload.status === suggestion.status) {
        throw new BadRequestError('Informe uma resposta ou altere o status');
      }
      const updated = await this.repository.update(suggestion.id, payload.revision, {
        status: payload.status, reply: payload.reply, createdAt: new Date(),
      });
      if (!updated) throw new ConflictError('Esta sugestão foi atualizada. Recarregue os detalhes antes de salvar.');
      res.json(200, updated);
    });
  }

  private async find(req: Request, platform = false) {
    const id = parseBody(suggestionIdSchema, req.params.id);
    const suggestion = await this.repository.findById(id, platform ? undefined : req.restaurantId!);
    if (!suggestion) throw new NotFoundError('Sugestão não encontrada');
    return suggestion;
  }
}
