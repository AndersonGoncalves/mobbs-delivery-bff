import type { Request, Response, Server } from 'restify';
import { ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import { IAdditionalGroupTemplateRepository } from '../domain/repositories/additional-group-template.repository.interface';
import {
  listAdditionalGroupTemplatesQuerySchema,
  saveAdditionalGroupTemplateSchema,
  setAdditionalGroupTemplateActiveSchema,
} from './additional-group-template.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

// specs/0025-adicionais-reutilizaveis-remocao REQ-1/REQ-4/REQ-7 — mesmo padrão de
// `RawMaterialsController` (specs/0007-cadastro-produtos T011): desativar (isActive: false) sem
// `confirmed` retorna 409 com os produtos afetados, sem aplicar nada, se o template estiver
// vinculado a algum produto ativo.
export class AdditionalGroupTemplatesController extends BaseRouter {
  constructor(
    private readonly templateRepository: IAdditionalGroupTemplateRepository,
    private readonly productRepository: IProductRepository,
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

    // specs/0026-selecao-clonar-excluir-busca-web REQ-7 — `name`/`isActive` filtram no servidor.
    application.get(
      '/restaurants/me/additional-group-templates',
      ...authenticated,
      async (req: Request, res: Response) => {
        const query = parseBody(listAdditionalGroupTemplatesQuerySchema, req.query ?? {});
        const templates = await this.templateRepository.listByRestaurant(req.restaurantId!, {
          name: query.name,
          isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
        });
        res.json(200, templates);
      },
    );

    application.post(
      '/restaurants/me/additional-group-templates',
      ...authenticated,
      async (req: Request, res: Response) => {
        const payload = parseBody(saveAdditionalGroupTemplateSchema, req.body);
        const template = await this.templateRepository.create(req.restaurantId!, payload);
        res.json(201, template);
      },
    );

    application.put(
      '/restaurants/me/additional-group-templates/:id',
      ...authenticated,
      async (req: Request, res: Response) => {
        const payload = parseBody(saveAdditionalGroupTemplateSchema, req.body);
        await this.findOwnedTemplate(req.params.id, req.restaurantId!);
        const template = await this.templateRepository.update(req.params.id, payload);
        res.json(200, template);
      },
    );

    application.patch(
      '/restaurants/me/additional-group-templates/:id/active',
      ...authenticated,
      async (req: Request, res: Response) => {
        const { isActive, confirmed } = parseBody(setAdditionalGroupTemplateActiveSchema, req.body);
        const template = await this.findOwnedTemplate(req.params.id, req.restaurantId!);

        if (!isActive && !confirmed) {
          const affectedProducts = await this.productRepository.findActiveByTemplateId(req.restaurantId!, template.id);
          if (affectedProducts.length > 0) {
            res.json(409, { requiresConfirmation: true, affectedProducts });
            return;
          }
        }

        const updated = await this.templateRepository.setActive(req.params.id, isActive);
        res.json(200, updated);
      },
    );

    // specs/0026-selecao-clonar-excluir-busca-web REQ-4/REQ-5/REQ-6 — exclusão REAL, só "dono",
    // bloqueada sem confirmação possível se já vinculado a algum produto (ativo ou não).
    const ownerOnly: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono'),
    ];
    application.del(
      '/restaurants/me/additional-group-templates/:id',
      ...ownerOnly,
      async (req: Request, res: Response) => {
        const template = await this.findOwnedTemplate(req.params.id, req.restaurantId!);
        const usageCount = await this.productRepository.countAnyByTemplateId(req.restaurantId!, template.id);
        if (usageCount > 0) {
          throw new ConflictError('Grupo de adicionais já foi usado em algum produto e não pode ser excluído');
        }
        await this.templateRepository.remove(template.id);
        res.send(204);
      },
    );
  }

  private async findOwnedTemplate(id: string, restaurantId: string) {
    const template = await this.templateRepository.findById(id);
    if (!template || template.restaurantId !== restaurantId) {
      throw new NotFoundError('Grupo de adicionais reutilizável não encontrado');
    }
    return template;
  }
}
