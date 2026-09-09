import { IProduct, IProductAdditionalGroup } from '../../domain/entities/product.entity';
import {
  IAffectedProduct,
  IProductRepository,
  NewProductInput,
  ProductUpdateInput,
} from '../../domain/repositories/product.repository.interface';
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

// REQ-7 (`specs/0007-cadastro-produtos`) — desce a árvore recursiva de `additionalGroups`
// procurando alguma opção que referencie `rawMaterialId`, em qualquer nível de aninhamento
// (produto composto, arquétipo 4).
function referencesRawMaterial(groups: IProductAdditionalGroup[], rawMaterialId: string): boolean {
  return groups.some((group) =>
    group.options.some(
      (option) =>
        option.rawMaterialId === rawMaterialId ||
        (option.nestedAdditionalGroups && referencesRawMaterial(option.nestedAdditionalGroups, rawMaterialId)),
    ),
  );
}

export class ProductMongooseRepository implements IProductRepository {
  async findById(id: string): Promise<IProduct | null> {
    const doc = await ProductModel.findById(id).lean<ProductLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async listByRestaurant(restaurantId: string): Promise<IProduct[]> {
    const docs = await ProductModel.find({ restaurantId }).lean<ProductLeanDocument[]>();
    return docs.map(toEntity);
  }

  async create(restaurantId: string, input: NewProductInput): Promise<IProduct> {
    const doc = await ProductModel.create({ restaurantId, ...input });
    return toEntity(doc.toObject() as ProductLeanDocument);
  }

  async update(id: string, input: ProductUpdateInput): Promise<IProduct> {
    const doc = await ProductModel.findByIdAndUpdate(id, { $set: input }, { new: true }).lean<ProductLeanDocument>();
    return toEntity(doc as ProductLeanDocument);
  }

  async setAvailable(id: string, isAvailable: boolean): Promise<IProduct> {
    const doc = await ProductModel.findByIdAndUpdate(
      id,
      { $set: { isAvailable } },
      { new: true },
    ).lean<ProductLeanDocument>();
    return toEntity(doc as ProductLeanDocument);
  }

  async findActiveByRawMaterialId(restaurantId: string, rawMaterialId: string): Promise<IAffectedProduct[]> {
    // Sem query recursiva nativa do Mongo pra árvore de profundidade arbitrária — filtra em
    // memória (catálogo por restaurante é pequeno o suficiente pra isso ser aceitável nesta v1).
    const docs = await ProductModel.find({ restaurantId, isAvailable: true }).lean<ProductLeanDocument[]>();
    return docs
      .filter((doc) => referencesRawMaterial(doc.additionalGroups ?? [], rawMaterialId))
      .map((doc) => ({ id: doc._id, name: doc.name }));
  }
}
