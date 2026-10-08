import { DayOfWeek } from '../../../../shared/utils/day-of-week';
import { IMenuCategory, IMenuCategoryWithProducts } from '../../domain/entities/menu-category.entity';
import { IProduct } from '../../domain/entities/product.entity';
import { IMenuCategoryRepository, MenuCategoryUpdateInput } from '../../domain/repositories/menu-category.repository.interface';
import { computePromotionalPrice, isPromotionCurrentlyActive } from '../../../promotions/domain/promotion-pricing';
import { IPromotionRepository } from '../../../promotions/domain/repositories/promotion.repository.interface';
import { MenuCategoryModel } from '../models/menu-category.mongoose.model';
import { ProductModel } from '../models/product.mongoose.model';

interface MenuCategoryLeanDocument {
  _id: string;
  restaurantId: string;
  name: string;
  sortOrder: number;
  isActive?: boolean;
  imageUrl?: string;
  activeDays?: DayOfWeek[];
}

type ProductLightLeanDocument = Omit<IProduct, 'id' | 'additionalGroups'> & {
  _id: string;
  // specs/0032-ajustes-diversos-rating-taxa-entrega REQ-1 — só o `id` de cada grupo (não
  // `name`/`options`/`nestedAdditionalGroups`/etc.), o suficiente pra computar
  // `hasAdditionalGroups` sem carregar a árvore inteira no cardápio.
  additionalGroups?: { id: string }[];
};

// specs/0044-promocoes-produtos REQ-2/REQ-3 — mesmo cruzamento de
// `product.mongoose.repository.ts` (`resolvePromotions`), mas nesta versão leve do cardápio
// (`activePromotionPercentage != null` decide se o app mostra a tag+preço riscado).
function toProductLight(doc: ProductLightLeanDocument, promotionPercentageByProductId: Map<string, number>): Omit<IProduct, 'additionalGroups'> {
  const activePromotionPercentage = promotionPercentageByProductId.get(doc._id);
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    menuCategoryId: doc.menuCategoryId,
    name: doc.name,
    description: doc.description,
    imageUrl: doc.imageUrl,
    price: doc.price,
    isAvailable: doc.isAvailable,
    // specs/0028-destaques-vendidos-banners REQ-3 — o app cliente filtra Destaques a partir
    // desta mesma listagem leve do cardápio, não busca produto por produto.
    isFeatured: doc.isFeatured ?? false,
    featuredOrder: doc.featuredOrder ?? 0,
    hasAdditionalGroups: (doc.additionalGroups?.length ?? 0) > 0,
    availableAsAdditional: doc.availableAsAdditional ?? false,
    activePromotionPercentage,
    promotionalPrice: activePromotionPercentage !== undefined ? computePromotionalPrice(doc.price, activePromotionPercentage) : undefined,
    // specs/0116-ajustes-cadastro-produto REQ-7/REQ-9/REQ-11 — o app filtra/exibe a partir desta
    // mesma listagem leve (TabBar e busca), por isso precisam vir aqui também, não só no detalhe
    // completo (`ProductMongooseRepository.toEntity`). `posId`/`cost`/`ncmCode` ficam de fora do
    // `.select()` abaixo de propósito — são só de retaguarda, não precisam trafegar pro app.
    activeDays: doc.activeDays,
    isAlcoholic: doc.isAlcoholic ?? false,
    scheduleStartTime: doc.scheduleStartTime,
    scheduleEndTime: doc.scheduleEndTime,
  };
}

export class MenuCategoryMongooseRepository implements IMenuCategoryRepository {
  constructor(private readonly promotionRepository: IPromotionRepository) {}

  async listByRestaurant(restaurantId: string): Promise<IMenuCategoryWithProducts[]> {
    const [categories, products, activePromotions] = await Promise.all([
      MenuCategoryModel.find({ restaurantId })
        .sort({ sortOrder: 1 })
        .lean<MenuCategoryLeanDocument[]>(),
      // REQ-1: versão leve da listagem — sem a árvore completa de `additionalGroups` (só
      // carregada no detalhe, GET /products/:id, REQ-3) pra manter o payload do cardápio
      // pequeno; `additionalGroups.id` é a exceção (specs/0032 REQ-1: só o suficiente pra
      // computar `hasAdditionalGroups` sem o resto da árvore).
      ProductModel.find({ restaurantId })
        .select(
          'restaurantId menuCategoryId name description imageUrl price isAvailable isFeatured featuredOrder additionalGroups.id ' +
            'activeDays isAlcoholic scheduleStartTime scheduleEndTime',
        )
        .lean<ProductLightLeanDocument[]>(),
      this.promotionRepository.findActiveByRestaurantId(restaurantId),
    ]);

    const now = new Date();
    const promotionPercentageByProductId = new Map<string, number>();
    for (const promotion of activePromotions) {
      if (!isPromotionCurrentlyActive(promotion, now)) continue;
      for (const productId of promotion.productIds) {
        promotionPercentageByProductId.set(productId, promotion.discountPercentage);
      }
    }

    return categories.map((category) => ({
      id: category._id,
      restaurantId: category.restaurantId,
      name: category.name,
      sortOrder: category.sortOrder,
      isActive: category.isActive ?? true,
      imageUrl: category.imageUrl,
      activeDays: category.activeDays,
      products: products
        .filter((product) => product.menuCategoryId === category._id)
        .map((product) => toProductLight(product, promotionPercentageByProductId)),
    }));
  }

  async create(restaurantId: string, name: string): Promise<IMenuCategory> {
    const count = await MenuCategoryModel.countDocuments({ restaurantId });
    const doc = await MenuCategoryModel.create({ restaurantId, name, sortOrder: count });
    return toMenuCategoryEntity(doc.toObject() as MenuCategoryLeanDocument);
  }

  async update(id: string, input: MenuCategoryUpdateInput): Promise<IMenuCategory> {
    // `$set` com valor `undefined` é descartado pelo driver (o campo ficaria do jeito que
    // estava) — `imageUrl` ausente precisa de `$unset` de verdade pra remover a imagem já salva
    // (REQ-2: "com opção de removê-la depois de enviada").
    const doc = await MenuCategoryModel.findByIdAndUpdate(
      id,
      input.imageUrl
        ? { $set: { name: input.name, imageUrl: input.imageUrl, activeDays: input.activeDays ?? [] } }
        : { $set: { name: input.name, activeDays: input.activeDays ?? [] }, $unset: { imageUrl: '' } },
      { new: true },
    ).lean<MenuCategoryLeanDocument>();
    return toMenuCategoryEntity(doc as MenuCategoryLeanDocument);
  }

  async setActive(id: string, isActive: boolean): Promise<IMenuCategory> {
    const doc = await MenuCategoryModel.findByIdAndUpdate(id, { $set: { isActive } }, { new: true }).lean<MenuCategoryLeanDocument>();
    return toMenuCategoryEntity(doc as MenuCategoryLeanDocument);
  }

  async reorder(restaurantId: string, orderedIds: string[]): Promise<IMenuCategory[]> {
    // REQ-1: só reordena categorias que realmente pertencem a este restaurante — ignora
    // qualquer id de fora (isolamento multi-tenant, nunca confiar só na lista mandada pelo
    // cliente).
    const owned = await MenuCategoryModel.find({ restaurantId }).select('_id').lean<{ _id: string }[]>();
    const ownedIds = new Set(owned.map((doc) => doc._id));

    await Promise.all(
      orderedIds
        .filter((id) => ownedIds.has(id))
        .map((id, index) => MenuCategoryModel.updateOne({ _id: id }, { $set: { sortOrder: index } })),
    );

    const docs = await MenuCategoryModel.find({ restaurantId })
      .sort({ sortOrder: 1 })
      .lean<MenuCategoryLeanDocument[]>();
    return docs.map(toMenuCategoryEntity);
  }

  async findById(id: string): Promise<IMenuCategory | null> {
    const doc = await MenuCategoryModel.findById(id).lean<MenuCategoryLeanDocument>();
    return doc ? toMenuCategoryEntity(doc) : null;
  }

  async remove(id: string): Promise<void> {
    await MenuCategoryModel.findByIdAndDelete(id);
  }
}

function toMenuCategoryEntity(doc: MenuCategoryLeanDocument): IMenuCategory {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    name: doc.name,
    sortOrder: doc.sortOrder,
    isActive: doc.isActive ?? true,
    imageUrl: doc.imageUrl,
    activeDays: doc.activeDays,
  };
}
