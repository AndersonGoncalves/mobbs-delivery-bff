import { RestaurantModel } from '../../src/modules/restaurants/infra/models/restaurant.mongoose.model';
import { MenuCategoryModel } from '../../src/modules/catalog/infra/models/menu-category.mongoose.model';
import { ProductModel } from '../../src/modules/catalog/infra/models/product.mongoose.model';
import { RawMaterialModel } from '../../src/modules/raw-materials/infra/models/raw-material.mongoose.model';
import { CustomerModel } from '../../src/modules/customers/infra/models/customer.mongoose.model';
import { AddressModel } from '../../src/modules/customers/infra/models/address.mongoose.model';
import { OrderModel } from '../../src/modules/orders/infra/models/order.mongoose.model';
import { OrderCounterModel } from '../../src/modules/orders/infra/models/order-counter.mongoose.model';
import { PaymentModel } from '../../src/modules/orders/infra/models/payment.mongoose.model';

// Só as coleções que este seeder de teste de carga popula — nunca o banco inteiro (pode ter
// outras coleções fora do escopo deste script, ex. feature flags/configuração).
const MODELS = [
  OrderModel,
  PaymentModel,
  OrderCounterModel,
  ProductModel,
  MenuCategoryModel,
  RawMaterialModel,
  AddressModel,
  CustomerModel,
  RestaurantModel,
];

export async function dropLoadTestCollections(): Promise<void> {
  for (const model of MODELS) {
    try {
      await model.collection.drop();
    } catch (error) {
      // "ns not found" — coleção já não existe (primeira execução), segue o jogo.
      const code = (error as { codeName?: string })?.codeName;
      if (code !== 'NamespaceNotFound') throw error;
    }
  }
}

export async function rebuildIndexes(): Promise<void> {
  for (const model of MODELS) {
    await model.createIndexes();
  }
}
