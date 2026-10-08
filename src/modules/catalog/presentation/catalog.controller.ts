import type { Request, Response, Server } from 'restify';
import { ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IAdditionalGroupTemplateRepository } from '../../additional-group-templates/domain/repositories/additional-group-template.repository.interface';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IMenuCategory } from '../domain/entities/menu-category.entity';
import { IProduct } from '../domain/entities/product.entity';
import { IMenuCategoryRepository } from '../domain/repositories/menu-category.repository.interface';
import { IProductImageStorage } from '../domain/product-image-storage';
import { IProductRepository } from '../domain/repositories/product.repository.interface';
import {
  listProductsQuerySchema,
  menuCategoryNameSchema,
  menuCategoryUpdateSchema,
  reorderBestSellersSchema,
  reorderCartSuggestionsSchema,
  reorderFeaturedProductsSchema,
  reorderMenuCategoriesSchema,
  saveProductSchema,
  setMenuCategoryActiveSchema,
  setProductAvailableSchema,
  updateProductSchema,
} from './catalog.schemas';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/**
 * REQ-1/REQ-3 (`specs/0003-catalogo-navegacao`) — leitura do cardápio do restaurante já resolvido
 * pelo cliente (`specs/0009`). Autenticado (`firebaseAuthMiddleware`, plan.md — "autenticadas via
 * 0002"), mas **sem** `restaurantOperatorMiddleware`: qualquer `Customer` logado pode ver o
 * cardápio de qualquer restaurante (não é uma rota de retaguarda) — `restaurantId` vem do próprio
 * path (`:id`), o restaurante já resolvido no app/web, nunca da identidade do operador.
 *
 * `specs/0007-cadastro-produtos` adiciona as rotas de escrita (`/restaurants/me/...`) — essas
 * sim são de retaguarda, com `restaurantOperatorMiddleware` (mesmo padrão de `0010`):
 * `restaurantId` vem sempre do token do operador, nunca de parâmetro de rota.
 *
 * Handlers `async (req, res)`, sem `next` — mesma regra de arity do Restify já documentada em
 * `RestaurantsController` (specs/0009 T008).
 */
export class CatalogController extends BaseRouter {
  constructor(
    private readonly menuCategoryRepository: IMenuCategoryRepository,
    private readonly productRepository: IProductRepository,
    private readonly restaurantOperatorMiddleware: AsyncHandler,
    // specs/0026-selecao-clonar-excluir-busca-web REQ-5 — checa se o produto já apareceu em
    // algum pedido (qualquer status) antes de permitir a exclusão real.
    private readonly orderRepository: IOrderRepository,
    // specs/0041-item-adicional-vinculado-produto REQ-4 — checa, junto do próprio
    // `productRepository`, se o produto está vinculado (`linkedProductId`) em algum template
    // reutilizável antes de permitir a exclusão real.
    private readonly additionalGroupTemplateRepository: IAdditionalGroupTemplateRepository,
    // specs/0099-preserva-imagem-compartilhada-s3-exclusao-produto — apaga do bucket só a foto
    // enviada pelo próprio restaurante, depois do registro removido.
    private readonly productImageStorage: IProductImageStorage,
  ) {
    super();
  }

  initializeRoutes(application: Server): void {
    application.get(
      '/restaurants/:id/menu-categories',
      firebaseAuthMiddleware,
      async (req: Request, res: Response) => {
        const categories = await this.menuCategoryRepository.listByRestaurant(req.params.id);
        res.json(200, categories);
      },
    );

    application.get('/products/:id', firebaseAuthMiddleware, async (req: Request, res: Response) => {
      const product = await this.productRepository.findById(req.params.id);
      res.json(200, this.render(product));
    });

    // specs/0028-destaques-vendidos-banners REQ-2 — pública (mesmo padrão de
    // `/restaurants/:id/menu-categories`): qualquer `Customer` logado pode ver "Mais pedidos".
    //
    // specs/0117-vitrine-manual-e-ajustes-formularios REQ-3/REQ-5 — mesma URL/formato de
    // resposta de antes desta spec, só troca a origem dos dados: de um cálculo por volume de
    // pedidos (`orderRepository.getBestSellingProductIds`) para o flag manual `isBestSeller`
    // (mesmo mecanismo de Destaques) — transparente pra quem consome este endpoint.
    application.get(
      '/restaurants/:id/best-sellers',
      firebaseAuthMiddleware,
      async (req: Request, res: Response) => {
        const products = await this.productRepository.getBestSellers(req.params.id);
        res.json(200, products.map((product) => ({ ...product, hasAdditionalGroups: product.additionalGroups.length > 0 })));
      },
    );

    // specs/0117-vitrine-manual-e-ajustes-formularios REQ-2/REQ-4 — mesmo padrão de
    // `/restaurants/:id/best-sellers`/`/restaurants/:id/featured-products`, pro flag manual
    // `isSuggestedInCart` ("Peça também" do carrinho do app, antes uma união de Destaques+Mais
    // vendidos calculados, agora sua própria lista curada).
    application.get(
      '/restaurants/:id/cart-suggestions',
      firebaseAuthMiddleware,
      async (req: Request, res: Response) => {
        const products = await this.productRepository.getCartSuggestions(req.params.id);
        res.json(200, products.map((product) => ({ ...product, hasAdditionalGroups: product.additionalGroups.length > 0 })));
      },
    );

    // specs/0033-ajustes-carrinho-enderecos-adicionais-pedidos-login — pública (mesmo padrão de
    // `/restaurants/:id/best-sellers`): endpoint leve dedicado a "Destaques", reaproveitado
    // tanto pelo cardápio quanto pela seção "Peça também" do Carrinho.
    application.get(
      '/restaurants/:id/featured-products',
      firebaseAuthMiddleware,
      async (req: Request, res: Response) => {
        const products = await this.productRepository.getFeatured(req.params.id);
        res.json(200, products.map((product) => ({ ...product, hasAdditionalGroups: product.additionalGroups.length > 0 })));
      },
    );

    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-1 — customer-scoped (não é retaguarda):
    // decide o badge "Peça novamente" no `HighlightsSection` do app, comparado contra os
    // produtos exibidos em Destaques/Mais Vendidos.
    application.get(
      '/restaurants/:id/purchased-product-ids',
      firebaseAuthMiddleware,
      async (req: Request, res: Response) => {
        const productIds = await this.orderRepository.getPurchasedProductIds(req.user!.uid, req.params.id);
        res.json(200, productIds);
      },
    );

    // specs/0021-papeis-operador REQ-3/T005 — cardápio é `dono`/`gerente` (sem `financeiro`).
    const authenticated: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono', 'gerente'),
    ];

    // REQ-1 (retaguarda): mesmo cardápio de cima, mas escopado pelo token do operador.
    application.get('/restaurants/me/menu-categories', ...authenticated, async (req: Request, res: Response) => {
      const categories = await this.menuCategoryRepository.listByRestaurant(req.restaurantId!);
      res.json(200, categories);
    });

    application.post('/restaurants/me/menu-categories', ...authenticated, async (req: Request, res: Response) => {
      const { name } = parseBody(menuCategoryNameSchema, req.body);
      const category = await this.menuCategoryRepository.create(req.restaurantId!, name);
      res.json(201, category);
    });

    application.put(
      '/restaurants/me/menu-categories/:id',
      ...authenticated,
      async (req: Request, res: Response) => {
        const input = parseBody(menuCategoryUpdateSchema, req.body);
        await this.findOwnedMenuCategory(req.params.id, req.restaurantId!);
        const category = await this.menuCategoryRepository.update(req.params.id, input);
        res.json(200, category);
      },
    );

    // specs/0061-categoria-ativa-inativa — mesmo padrão de `PATCH .../products/:id/available`.
    application.patch(
      '/restaurants/me/menu-categories/:id/active',
      ...authenticated,
      async (req: Request, res: Response) => {
        const { isActive } = parseBody(setMenuCategoryActiveSchema, req.body);
        await this.findOwnedMenuCategory(req.params.id, req.restaurantId!);
        const category = await this.menuCategoryRepository.setActive(req.params.id, isActive);
        res.json(200, category);
      },
    );

    application.put(
      '/restaurants/me/menu-categories/reorder',
      ...authenticated,
      async (req: Request, res: Response) => {
        const { orderedIds } = parseBody(reorderMenuCategoriesSchema, req.body);
        const categories = await this.menuCategoryRepository.reorder(req.restaurantId!, orderedIds);
        res.json(200, categories);
      },
    );

    // REQ-2 (retaguarda): produtos completos (com `additionalGroups`) do restaurante do operador.
    // specs/0026-selecao-clonar-excluir-busca-web REQ-7 — `name`/`isAvailable` filtram no servidor.
    application.get('/restaurants/me/products', ...authenticated, async (req: Request, res: Response) => {
      const query = parseBody(listProductsQuerySchema, req.query ?? {});
      const products = await this.productRepository.listByRestaurant(req.restaurantId!, {
        name: query.name,
        isAvailable: query.isAvailable === undefined ? undefined : query.isAvailable === 'true',
      });
      res.json(200, products);
    });

    application.post('/restaurants/me/products', ...authenticated, async (req: Request, res: Response) => {
      const payload = parseBody(saveProductSchema, req.body);
      const product = await this.productRepository.create(req.restaurantId!, payload);
      res.json(201, product);
    });

    application.put('/restaurants/me/products/:id', ...authenticated, async (req: Request, res: Response) => {
      const payload = parseBody(updateProductSchema, req.body);
      const existing = await this.findOwnedProduct(req.params.id, req.restaurantId!);
      const product = await this.productRepository.update(req.params.id, payload);
      // specs/0109-galeria-fotos-produto REQ-13 — foto removida da galeria só é apagada do S3 se
      // nenhum outro produto do restaurante ainda a referencia (checado antes de cada exclusão).
      if (payload.images !== undefined) {
        const removedUrls = (existing.images ?? (existing.imageUrl ? [existing.imageUrl] : [])).filter((url) => !payload.images!.includes(url));
        await Promise.all(removedUrls.map((url) => this.deleteProductImageIfUnused(url, req.restaurantId!, product.id)));
      }
      res.json(200, product);
    });

    // specs/0028-destaques-vendidos-banners REQ-3 — mesmo padrão de
    // `/restaurants/me/menu-categories/reorder`.
    application.put(
      '/restaurants/me/products/featured/reorder',
      ...authenticated,
      async (req: Request, res: Response) => {
        const { orderedIds } = parseBody(reorderFeaturedProductsSchema, req.body);
        const products = await this.productRepository.reorderFeatured(req.restaurantId!, orderedIds);
        res.json(200, products);
      },
    );

    // specs/0117-vitrine-manual-e-ajustes-formularios REQ-1/REQ-9 — mesmo padrão de
    // `.../products/featured/reorder`.
    application.put(
      '/restaurants/me/products/best-sellers/reorder',
      ...authenticated,
      async (req: Request, res: Response) => {
        const { orderedIds } = parseBody(reorderBestSellersSchema, req.body);
        const products = await this.productRepository.reorderBestSellers(req.restaurantId!, orderedIds);
        res.json(200, products);
      },
    );

    // specs/0117-vitrine-manual-e-ajustes-formularios REQ-2/REQ-9 — mesmo padrão de
    // `.../products/featured/reorder`.
    application.put(
      '/restaurants/me/products/cart-suggestions/reorder',
      ...authenticated,
      async (req: Request, res: Response) => {
        const { orderedIds } = parseBody(reorderCartSuggestionsSchema, req.body);
        const products = await this.productRepository.reorderCartSuggestions(req.restaurantId!, orderedIds);
        res.json(200, products);
      },
    );

    application.patch(
      '/restaurants/me/products/:id/available',
      ...authenticated,
      async (req: Request, res: Response) => {
        const { isAvailable } = parseBody(setProductAvailableSchema, req.body);
        await this.findOwnedProduct(req.params.id, req.restaurantId!);
        const product = await this.productRepository.setAvailable(req.params.id, isAvailable);
        res.json(200, product);
      },
    );

    // specs/0026-selecao-clonar-excluir-busca-web REQ-4/REQ-5/REQ-6 — exclusão REAL (diferente
    // de `available`), só pra "dono", bloqueada sem confirmação possível se já foi usado alguma
    // vez em algum pedido (qualquer status).
    const ownerOnly: AsyncHandler[] = [
      firebaseAuthMiddleware,
      this.restaurantOperatorMiddleware,
      requireOperatorRole('dono'),
    ];
    application.del('/restaurants/me/products/:id', ...ownerOnly, async (req: Request, res: Response) => {
      const product = await this.findOwnedProduct(req.params.id, req.restaurantId!);
      const usageCount = await this.orderRepository.countByProduct(req.restaurantId!, product.id);
      if (usageCount > 0) {
        throw new ConflictError('Produto já foi usado em algum pedido e não pode ser excluído');
      }
      // specs/0041-item-adicional-vinculado-produto REQ-4 — varre os dois lugares onde um
      // `linkedProductId` pode existir: grupos inline de outros produtos e templates
      // reutilizáveis (`specs/0025`), listando os nomes na mensagem de bloqueio.
      const [linkingProducts, linkingTemplates] = await Promise.all([
        this.productRepository.findAnyByLinkedProductId(req.restaurantId!, product.id),
        this.additionalGroupTemplateRepository.findAnyByLinkedProductId(req.restaurantId!, product.id),
      ]);
      if (linkingProducts.length > 0 || linkingTemplates.length > 0) {
        const names = [...linkingProducts, ...linkingTemplates].map((item) => item.name).join(', ');
        throw new ConflictError(`Produto usado como adicional em: ${names} — não pode ser excluído`);
      }
      await this.productRepository.remove(product.id);
      // specs/0109-galeria-fotos-produto REQ-13 — apaga toda a galeria (não só `imageUrl`),
      // cada foto checada individualmente contra uso por outro produto antes de apagar do S3.
      const allImages = product.images ?? (product.imageUrl ? [product.imageUrl] : []);
      await Promise.all(allImages.map((url) => this.deleteProductImageIfUnused(url, req.restaurantId!, product.id)));
      res.send(204);
    });

    // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-5 — mesmo padrão de exclusão de
    // produto acima: só "dono", bloqueada se a categoria ainda tiver produtos.
    application.del('/restaurants/me/menu-categories/:id', ...ownerOnly, async (req: Request, res: Response) => {
      const category = await this.findOwnedMenuCategory(req.params.id, req.restaurantId!);
      const productCount = await this.productRepository.countByMenuCategory(req.restaurantId!, category.id);
      if (productCount > 0) {
        throw new ConflictError('Categoria tem produtos cadastrados e não pode ser excluída');
      }
      await this.menuCategoryRepository.remove(category.id);
      res.send(204);
    });
  }

  private async findOwnedMenuCategory(id: string, restaurantId: string): Promise<IMenuCategory> {
    const category = await this.menuCategoryRepository.findById(id);
    if (!category || category.restaurantId !== restaurantId) {
      throw new NotFoundError('Categoria não encontrada');
    }
    return category;
  }

  private async findOwnedProduct(id: string, restaurantId: string): Promise<IProduct> {
    const product = await this.productRepository.findById(id);
    if (!product || product.restaurantId !== restaurantId) {
      throw new NotFoundError('Produto não encontrado');
    }
    return product;
  }

  /** specs/0109-galeria-fotos-produto REQ-13 — só apaga do S3 (`deleteProductImageIfOwned`, que
   * já restringe ao prefixo do próprio restaurante) depois de confirmar que nenhum outro produto
   * do restaurante ainda referencia essa URL. */
  private async deleteProductImageIfUnused(url: string, restaurantId: string, excludingProductId: string): Promise<void> {
    const stillUsed = await this.productRepository.existsProductWithImageUrl(restaurantId, url, excludingProductId);
    if (stillUsed) return;
    await this.productImageStorage.deleteProductImageIfOwned(url, restaurantId);
  }
}
