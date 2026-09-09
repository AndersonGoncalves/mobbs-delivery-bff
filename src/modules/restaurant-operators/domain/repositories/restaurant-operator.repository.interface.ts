import { IRestaurantOperator } from '../entities/restaurant-operator.entity';

export interface IRestaurantOperatorRepository {
  /**
   * Resolve qual restaurante o operador loga na retaguarda, a partir só do e-mail (nunca de um
   * parâmetro de rota — plan.md de specs/0010). **Gap conhecido**: docs/architecture/data-model.md
   * permite um e-mail ser operador de mais de um restaurante (cada vínculo é um registro), mas o
   * fluxo de login desta v1 não desambigua isso — retorna o primeiro vínculo ativo encontrado.
   * Cenário multi-restaurante por operador fica pra quando houver demanda real.
   */
  findActiveOperatorByEmail(email: string): Promise<IRestaurantOperator | null>;
  listByRestaurant(restaurantId: string): Promise<IRestaurantOperator[]>;
  countActiveByRestaurant(restaurantId: string): Promise<number>;
  create(restaurantId: string, email: string): Promise<IRestaurantOperator>;
  deactivate(id: string): Promise<void>;
  findById(id: string): Promise<IRestaurantOperator | null>;
}
