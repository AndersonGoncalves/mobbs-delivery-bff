import { IMenuCategoryWithProducts } from '../../domain/entities/menu-category.entity';
import { IProduct } from '../../domain/entities/product.entity';
import { IMenuCategoryRepository } from '../../domain/repositories/menu-category.repository.interface';
import { MenuCategoryModel } from '../models/menu-category.mongoose.model';
import { ProductModel } from '../models/product.mongoose.model';

interface MenuCategoryLeanDocument {
  _id: string;
  restaurantId: string;
  name: string;
  sortOrder: number;
}

type ProductLightLeanDocument = Omit<IProduct, 'id' | 'additionalGroups'> & { _id: string };

function toProductLight(doc: ProductLightLeanDocument): Omit<IProduct, 'additionalGroups'> {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    menuCategoryId: doc.menuCategoryId,
    name: doc.name,
    description: doc.description,
    imageUrl: doc.imageUrl,
    price: doc.price,
    isAvailable: doc.isAvailable,
  };
}

export class MenuCategoryMongooseRepository implements IMenuCategoryRepository {
  async listByRestaurant(restaurantId: string): Promise<IMenuCategoryWithProducts[]> {
    const [categories, products] = await Promise.all([
      MenuCategoryModel.find({ restaurantId })
        .sort({ sortOrder: 1 })
        .lean<MenuCategoryLeanDocument[]>(),
      // REQ-1: versão leve da listagem — sem `additionalGroups`, só carregados no detalhe
      // (GET /products/:id, REQ-3) pra manter o payload do cardápio pequeno.
      ProductModel.find({ restaurantId })
        .select('-additionalGroups')
        .lean<ProductLightLeanDocument[]>(),
    ]);

    return categories.map((category) => ({
      id: category._id,
      restaurantId: category.restaurantId,
      name: category.name,
      sortOrder: category.sortOrder,
      products: products.filter((product) => product.menuCategoryId === category._id).map(toProductLight),
    }));
  }
}
