import type { Request, Response, Server } from 'restify';
import { ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { IAdditionalGroupTemplate } from '../../additional-group-templates/domain/entities/additional-group-template.entity';
import { IAdditionalGroupTemplateRepository } from '../../additional-group-templates/domain/repositories/additional-group-template.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import {
  listAdditionalGroupTemplatesQuerySchema,
  saveAdditionalGroupTemplateSchema,
  setAdditionalGroupTemplateActiveSchema,
} from '../../additional-group-templates/presentation/additional-group-template.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * Pedido explícito do usuário (18/11/2026, 4ª leva) — "Grupo de Adicionais" no menu "⋮" de
 * `PlatformRestaurantsPage`: mesmo raciocínio de `PlatformRestaurantRawMaterialsController` —
 * reaproveita o MESMO repositório/regras de `AdditionalGroupTemplatesController`, só muda de onde
 * vem o `restaurantId` (`:id` da URL, não a sessão) e quem pode chamar.
 *
 * Exclusão real reaproveitada por inteiro (mesma checagem simples de uso — `countAnyByTemplateId`
 * — que o dono já usa), mesmo raciocínio de Matéria-prima.
 */
export class PlatformRestaurantAdditionalGroupTemplatesController extends BaseRouter {
  constructor(
    private readonly templateRepository: IAdditionalGroupTemplateRepository,
    private readonly productRepository: IProductRepository,
    private readonly platformAdminMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const adminAuthenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.platformAdminMiddleware];

    application.get(
      '/platform/restaurants/:id/additional-group-templates',
      ...adminAuthenticated,
      async (req: Request, res: Response) => {
        const query = parseBody(listAdditionalGroupTemplatesQuerySchema, req.query ?? {});
        const templates = await this.templateRepository.listByRestaurant(req.params.id, {
          name: query.name,
          isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
        });
        res.json(200, templates);
      },
    );

    application.post(
      '/platform/restaurants/:id/additional-group-templates',
      ...adminAuthenticated,
      async (req: Request, res: Response) => {
        const payload = parseBody(saveAdditionalGroupTemplateSchema, req.body);
        const template = await this.templateRepository.create(req.params.id, payload);
        res.json(201, template);
      },
    );

    application.put(
      '/platform/restaurants/:id/additional-group-templates/:templateId',
      ...adminAuthenticated,
      async (req: Request, res: Response) => {
        const payload = parseBody(saveAdditionalGroupTemplateSchema, req.body);
        await this.findOwnedTemplate(req.params.templateId, req.params.id);
        const template = await this.templateRepository.update(req.params.templateId, payload);
        res.json(200, template);
      },
    );

    application.patch(
      '/platform/restaurants/:id/additional-group-templates/:templateId/active',
      ...adminAuthenticated,
      async (req: Request, res: Response) => {
        const { isActive, confirmed } = parseBody(setAdditionalGroupTemplateActiveSchema, req.body);
        const template = await this.findOwnedTemplate(req.params.templateId, req.params.id);

        if (!isActive && !confirmed) {
          const affectedProducts = await this.productRepository.findActiveByTemplateId(req.params.id, template.id);
          if (affectedProducts.length > 0) {
            res.json(409, { requiresConfirmation: true, affectedProducts });
            return;
          }
        }

        const updated = await this.templateRepository.setActive(req.params.templateId, isActive);
        res.json(200, updated);
      },
    );

    application.del(
      '/platform/restaurants/:id/additional-group-templates/:templateId',
      ...adminAuthenticated,
      async (req: Request, res: Response) => {
        const template = await this.findOwnedTemplate(req.params.templateId, req.params.id);
        const usageCount = await this.productRepository.countAnyByTemplateId(req.params.id, template.id);
        if (usageCount > 0) {
          throw new ConflictError('Grupo de adicionais já foi usado em algum produto e não pode ser excluído');
        }
        await this.templateRepository.remove(template.id);
        res.send(204);
      },
    );
  }

  private async findOwnedTemplate(id: string, restaurantId: string): Promise<IAdditionalGroupTemplate> {
    const template = await this.templateRepository.findById(id);
    if (!template || template.restaurantId !== restaurantId) {
      throw new NotFoundError('Grupo de adicionais reutilizável não encontrado');
    }
    return template;
  }
}
