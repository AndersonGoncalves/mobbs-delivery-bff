import type { Request, Response, Server } from 'restify';
import { NotFoundError } from 'restify-errors';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { environment } from '../../../shared/config/environment';
import { s3Client } from '../../../shared/storage/s3-client';
import { buildUploadKey } from '../../uploads/domain/build-upload-key';
import { presignUploadSchema } from '../../uploads/presentation/uploads.schemas';
import { resolvePagination } from '../../../shared/http/pagination';
import { IProduct } from '../../catalog/domain/entities/product.entity';
import { IMenuCategoryRepository } from '../../catalog/domain/repositories/menu-category.repository.interface';
import { IProductRepository } from '../../catalog/domain/repositories/product.repository.interface';
import {
  listProductsQuerySchema,
  saveProductSchema,
  setProductAvailableSchema,
  updateProductSchema,
} from '../../catalog/presentation/catalog.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * Pedido explícito do usuário (18/11/2026, 3ª leva) — "Produtos" no menu "⋮" de
 * `PlatformRestaurantsPage`: cadastro/manutenção do catálogo de qualquer restaurante, pelo admin
 * da plataforma, sem logar como o dono. Reaproveita o MESMO repositório/regras de
 * `CatalogController` (nunca duplica a validação/regra de negócio) — só muda de onde vem o
 * `restaurantId` (`:id` da URL, não da sessão do operador) e quem pode chamar.
 *
 * Escopo deliberadamente menor que o cadastro completo do dono (ver conversa que gerou esta
 * tarefa):
 * - Sem edição de `additionalGroups` (adicionais) — o builder de adicionais é um subsistema
 *   próprio (depende de matéria-prima e de outros produtos vinculáveis do MESMO restaurante);
 *   replicar isso aqui significaria também criar rotas administrativas pra matéria-prima e
 *   vínculo de produto, fora do pedido original ("cadastro de produtos"). `saveProductSchema`/
 *   `updateProductSchema` aceitam a ausência do campo (`default([])` no schema), então criar/
 *   editar um produto por aqui simplesmente não mexe nos adicionais que já existirem.
 * - Sem exclusão real (`DELETE`) — a exclusão do dono tem checagem de uso em pedidos e em
 *   templates/outros produtos vinculados (`CatalogController.del('/restaurants/me/products/:id')`),
 *   lógica sensível o bastante pra não duplicar numa primeira leva; o admin pode marcar
 *   "Indisponível" em vez de excluir.
 * - Categoria é só leitura aqui (lista as já cadastradas pelo restaurante, pro seletor do
 *   formulário) — criar uma categoria nova continua sendo só o dono, pela tela normal.
 */
export class PlatformRestaurantProductsController extends BaseRouter {
  constructor(
    private readonly menuCategoryRepository: IMenuCategoryRepository,
    private readonly productRepository: IProductRepository,
    private readonly platformAdminMiddleware: AsyncHandler,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    const adminAuthenticated: AsyncHandler[] = [firebaseAuthMiddleware, this.platformAdminMiddleware];

    application.get('/platform/restaurants/:id/menu-categories', ...adminAuthenticated, async (req: Request, res: Response) => {
      const categories = await this.menuCategoryRepository.listByRestaurant(req.params.id);
      res.json(200, categories);
    });

    application.get('/platform/restaurants/:id/products', ...adminAuthenticated, async (req: Request, res: Response) => {
      const query = parseBody(listProductsQuerySchema, req.query ?? {});
      const filters = { name: query.name, isAvailable: query.isAvailable === undefined ? undefined : query.isAvailable === 'true' };
      const pagination = resolvePagination(query);
      if (!pagination) {
        res.json(200, await this.productRepository.listByRestaurant(req.params.id, filters));
        return;
      }
      const { items, total } = await this.productRepository.listByRestaurantPage(req.params.id, filters, pagination);
      res.header('X-Total-Count', String(total));
      res.json(200, items);
    });

    application.post('/platform/restaurants/:id/products', ...adminAuthenticated, async (req: Request, res: Response) => {
      const payload = parseBody(saveProductSchema, req.body);
      const product = await this.productRepository.create(req.params.id, payload);
      res.json(201, product);
    });

    application.put('/platform/restaurants/:id/products/:productId', ...adminAuthenticated, async (req: Request, res: Response) => {
      const payload = parseBody(updateProductSchema, req.body);
      await this.findOwnedProduct(req.params.productId, req.params.id);
      const product = await this.productRepository.update(req.params.productId, payload);
      res.json(200, product);
    });

    application.patch(
      '/platform/restaurants/:id/products/:productId/available',
      ...adminAuthenticated,
      async (req: Request, res: Response) => {
        const { isAvailable } = parseBody(setProductAvailableSchema, req.body);
        await this.findOwnedProduct(req.params.productId, req.params.id);
        const product = await this.productRepository.setAvailable(req.params.productId, isAvailable);
        res.json(200, product);
      },
    );

    // Mesmo mecanismo de `UploadsController` (upload direto pro S3 via URL pré-assinada), só
    // trocando de onde vem o `restaurantId` que monta o caminho no bucket (`:id` da URL, nunca da
    // sessão — o admin da plataforma não tem sessão de operador de nenhum restaurante).
    application.post('/platform/restaurants/:id/uploads/presign', ...adminAuthenticated, async (req: Request, res: Response) => {
      const { kind, filename } = parseBody(presignUploadSchema, req.body);
      const key = buildUploadKey(kind, req.params.id, filename);

      const uploadUrl = await getSignedUrl(
        s3Client,
        new PutObjectCommand({ Bucket: environment.s3.bucket, Key: key }),
        { expiresIn: 300 },
      );
      const publicUrl = `https://${environment.s3.bucket}.s3.${environment.s3.region}.amazonaws.com/${key}`;

      res.json(200, { uploadUrl, publicUrl });
    });
  }

  private async findOwnedProduct(id: string, restaurantId: string): Promise<IProduct> {
    const product = await this.productRepository.findById(id);
    if (!product || product.restaurantId !== restaurantId) {
      throw new NotFoundError('Produto não encontrado');
    }
    return product;
  }
}
