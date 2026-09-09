import { Server } from './shared/http/server';
import { buildRestaurantOperatorMiddleware } from './shared/http/restaurant-operator.middleware';
import { RestaurantMongooseRepository } from './modules/restaurants/infra/repositories/restaurant.mongoose.repository';
import { RestaurantsController } from './modules/restaurants/presentation/restaurants.controller';
import { RestaurantOperatorMongooseRepository } from './modules/restaurant-operators/infra/repositories/restaurant-operator.mongoose.repository';
import { RestaurantOperatorsController } from './modules/restaurant-operators/presentation/restaurant-operators.controller';
import { MenuCategoryMongooseRepository } from './modules/catalog/infra/repositories/menu-category.mongoose.repository';
import { ProductMongooseRepository } from './modules/catalog/infra/repositories/product.mongoose.repository';
import { CatalogController } from './modules/catalog/presentation/catalog.controller';
import { OrderMongooseRepository } from './modules/orders/infra/repositories/order.mongoose.repository';
import { OrdersController } from './modules/orders/presentation/orders.controller';
import { RawMaterialMongooseRepository } from './modules/raw-materials/infra/repositories/raw-material.mongoose.repository';
import { RawMaterialsController } from './modules/raw-materials/presentation/raw-materials.controller';
import { AddressMongooseRepository } from './modules/customers/infra/repositories/address.mongoose.repository';
import { CustomerMongooseRepository } from './modules/customers/infra/repositories/customer.mongoose.repository';
import { CustomersController } from './modules/customers/presentation/customers.controller';

const server = new Server();

const restaurantOperatorRepository = new RestaurantOperatorMongooseRepository();
const restaurantOperatorMiddleware = buildRestaurantOperatorMiddleware(restaurantOperatorRepository);
const restaurantRepository = new RestaurantMongooseRepository();
const productRepository = new ProductMongooseRepository();

server
  .bootstrap([
    new RestaurantsController(restaurantRepository, restaurantOperatorMiddleware),
    new RestaurantOperatorsController(restaurantOperatorRepository, restaurantOperatorMiddleware),
    new CatalogController(new MenuCategoryMongooseRepository(), productRepository, restaurantOperatorMiddleware),
    new OrdersController(new OrderMongooseRepository(), restaurantRepository, restaurantOperatorMiddleware),
    new RawMaterialsController(new RawMaterialMongooseRepository(), productRepository, restaurantOperatorMiddleware),
    new CustomersController(new CustomerMongooseRepository(), new AddressMongooseRepository()),
  ])
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Falha ao iniciar o servidor:', error);
    process.exit(1);
  });
