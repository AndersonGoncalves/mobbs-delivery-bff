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

const server = new Server();

const restaurantOperatorRepository = new RestaurantOperatorMongooseRepository();
const restaurantOperatorMiddleware = buildRestaurantOperatorMiddleware(restaurantOperatorRepository);
const restaurantRepository = new RestaurantMongooseRepository();

server
  .bootstrap([
    new RestaurantsController(restaurantRepository, restaurantOperatorMiddleware),
    new RestaurantOperatorsController(restaurantOperatorRepository, restaurantOperatorMiddleware),
    new CatalogController(new MenuCategoryMongooseRepository(), new ProductMongooseRepository()),
    new OrdersController(new OrderMongooseRepository(), restaurantRepository),
  ])
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Falha ao iniciar o servidor:', error);
    process.exit(1);
  });
