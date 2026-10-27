import { IResellerClient, ResellerClientOrigin } from '../entities/reseller-client.entity';

export interface IResellerClientRepository {
  create(input: { resellerId: string; restaurantId: string; origin: ResellerClientOrigin }): Promise<IResellerClient>;
  /** REQ-7 — todos os clientes efetivados do revendedor. */
  listByReseller(resellerId: string): Promise<IResellerClient[]>;
  /** plan.md decisão 3 — checagem explícita antes de criar (um restaurante só tem um revendedor);
   * também usado pra filtrar `GET .../convertible-restaurants` (REQ-8). */
  findByRestaurantId(restaurantId: string): Promise<IResellerClient | null>;
  /** Todos os `restaurantId` já reclamados por qualquer revendedor (REQ-8 — exclui da lista de
   * conversão manual). */
  listClaimedRestaurantIds(): Promise<Set<string>>;
  /** REQ-13 — contagem por revendedor, painel administrativo. */
  countByReseller(resellerId: string): Promise<number>;
}
