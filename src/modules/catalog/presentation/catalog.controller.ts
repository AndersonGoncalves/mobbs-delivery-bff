import type { Request, Response, Server } from 'restify';
import { ConflictError, NotFoundError } from 'restify-errors';

import { BaseRouter } from '../../../shared/router/base.router';
import { parseBody } from '../../../shared/http/validate';
import { firebaseAuthMiddleware } from '../../../shared/http/firebase-auth.middleware';
import { requireOperatorRole } from '../../../shared/http/require-operator-role.middleware';
import { IAdditionalGroupTemplateRepository } from '../../additional-group-templates/domain/repositories/additional-group-template.repository.interface';
import { IOrderRepository } from '../../orders/domain/repositories/order.repository.interface';
import { IRestaurantRepository } from '../../restaurants/domain/repositories/restaurant.repository.interface';
import { IMenuCategory } from '../domain/entities/menu-category.entity';
import { IProduct } from '../domain/entities/product.entity';
import { IMenuCategoryRepository } from '../domain/repositories/menu-category.repository.interface';
import { IProductRepository } from '../domain/repositories/product.repository.interface';
import {
  listProductsQuerySchema,
  menuCategoryNameSchema,
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
    // specs/0028-destaques-vendidos-banners REQ-2 — lê `bestSellersCount` do restaurante.
    private readonly restaurantRepository: IRestaurantRepository,
    // specs/0041-item-adicional-vinculado-produto REQ-4 — checa, junto do próprio
    // `productRepository`, se o produto está vinculado (`linkedProductId`) em algum template
    // reutilizável antes de permitir a exclusão real.
    private readonly additionalGroupTemplateRepository: IAdditionalGroupTemplateRepository,
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
    // `/restaurants/:id/menu-categories`): qualquer `Customer` logado pode ver o ranking de
    // "mais vendidos" de qualquer restaurante.
    application.get(
      '/restaurants/:id/best-sellers',
      firebaseAuthMiddleware,
      async (req: Request, res: Response) => {
        const restaurant = await this.restaurantRepository.findById(req.params.id);
        // `bestSellersCount` é o limite da seção "Mais vendidos" do cardápio (controlada por
        // `showBestSellers`), mas este endpoint também alimenta a tag "Mais pedido" em Destaques/
        // Favoritos/"Peça também" — usos independentes do toggle. Um restaurante que nunca abriu
        // essa configuração (`bestSellersCount` zerado/ausente) ainda assim tem produtos com
        // vendas reais, então cai num teto padrão de 10 em vez de not_configured => sem ranking
        // nenhum.
        const limit = restaurant?.bestSellersCount || 10;
        const bestSellingIds = restaurant ? await this.orderRepository.getBestSellingProductIds(req.params.id, limit) : [];
        const products = await Promise.all(bestSellingIds.map((id) => this.productRepository.findById(id)));
        // specs/0031-imagem-padrao-disponibilidade-checkout-ajustes REQ-5 — produto indisponível
        // não aparece em "Mais vendidos", mesmo tendo vendas passadas.
        const available = products.filter((product): product is IProduct => product !== null && product.isAvailable);
        // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-1 — aqui a leitura já é completa
        // (`findById`), então `hasAdditionalGroups` é só derivado do array já carregado, sem
        // nenhuma query extra.
        res.json(200, available.map((product) => ({ ...product, hasAdditionalGroups: product.additionalGroups.length > 0 })));
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
        const { name } = parseBody(menuCategoryNameSchema, req.body);
        await this.findOwnedMenuCategory(req.params.id, req.restaurantId!);
        const category = await this.menuCategoryRepository.update(req.params.id, name);
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
      await this.findOwnedProduct(req.params.id, req.restaurantId!);
      const product = await this.productRepository.update(req.params.id, payload);
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
}
