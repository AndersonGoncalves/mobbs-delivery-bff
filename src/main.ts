import { Server } from './shared/http/server';
import { buildRestaurantOperatorMiddleware } from './shared/http/restaurant-operator.middleware';
import { RestaurantMongooseRepository } from './modules/restaurants/infra/repositories/restaurant.mongoose.repository';
import { RestaurantsController } from './modules/restaurants/presentation/restaurants.controller';
import { RestaurantOperatorMongooseRepository } from './modules/restaurant-operators/infra/repositories/restaurant-operator.mongoose.repository';
import { RestaurantOperatorsController } from './modules/restaurant-operators/presentation/restaurant-operators.controller';

const server = new Server();

const restaurantOperatorRepository = new RestaurantOperatorMongooseRepository();
const restaurantOperatorMiddleware = buildRestaurantOperatorMiddleware(restaurantOperatorRepository);

server
  .bootstrap([
    new RestaurantsController(new RestaurantMongooseRepository(), restaurantOperatorMiddleware),
    new RestaurantOperatorsController(restaurantOperatorRepository, restaurantOperatorMiddleware),
  ])
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Falha ao iniciar o servidor:', error);
    process.exit(1);
  });
