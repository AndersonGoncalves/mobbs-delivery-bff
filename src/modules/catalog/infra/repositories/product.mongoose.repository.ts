import { IProduct } from '../../domain/entities/product.entity';
import { IProductRepository } from '../../domain/repositories/product.repository.interface';
import { ProductModel } from '../models/product.mongoose.model';

interface ProductLeanDocument extends Omit<IProduct, 'id'> {
  _id: string;
}

function toEntity(doc: ProductLeanDocument): IProduct {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    menuCategoryId: doc.menuCategoryId,
    name: doc.name,
    description: doc.description,
    imageUrl: doc.imageUrl,
    price: doc.price,
    isAvailable: doc.isAvailable,
    additionalGroups: doc.additionalGroups ?? [],
  };
}

export class ProductMongooseRepository implements IProductRepository {
  async findById(id: string): Promise<IProduct | null> {
    const doc = await ProductModel.findById(id).lean<ProductLeanDocument>();
    return doc ? toEntity(doc) : null;
  }
}
