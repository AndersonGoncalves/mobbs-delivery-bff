import { IUberDeliveryConfig } from '../entities/uber-delivery-config.entity';

export interface SaveUberDeliveryConfigInput {
  customerId: string;
  clientId: string;
  clientSecret: string;
  originZipCode: string;
}

export interface IUberDeliveryConfigRepository {
  findByRestaurantId(restaurantId: string): Promise<IUberDeliveryConfig | null>;

  /** REQ-1 — cria ou atualiza a config inteira; preserva `webhookToken` já existente (gera um
   * novo só na primeira vez, mesmo padrão de `IFiscalConfigRepository.upsert`). */
  upsert(restaurantId: string, input: SaveUberDeliveryConfigInput): Promise<IUberDeliveryConfig>;

  delete(restaurantId: string): Promise<void>;
}
