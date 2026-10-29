import { randomBytes } from 'crypto';

import { IUberDeliveryConfig } from '../../domain/entities/uber-delivery-config.entity';
import { IUberDeliveryConfigRepository, SaveUberDeliveryConfigInput } from '../../domain/repositories/uber-delivery-config.repository.interface';
import { UberDeliveryConfigModel } from '../models/uber-delivery-config.mongoose.model';

interface UberDeliveryConfigLeanDocument {
  restaurantId: string;
  customerId: string;
  clientId: string;
  clientSecret: string;
  originZipCode: string;
  webhookToken: string;
  createdAt: Date;
  updatedAt: Date;
}

function toEntity(doc: UberDeliveryConfigLeanDocument): IUberDeliveryConfig {
  return {
    restaurantId: doc.restaurantId,
    customerId: doc.customerId,
    clientId: doc.clientId,
    clientSecret: doc.clientSecret,
    originZipCode: doc.originZipCode,
    webhookToken: doc.webhookToken,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export class UberDeliveryConfigMongooseRepository implements IUberDeliveryConfigRepository {
  async findByRestaurantId(restaurantId: string): Promise<IUberDeliveryConfig | null> {
    const doc = await UberDeliveryConfigModel.findOne({ restaurantId }).lean<UberDeliveryConfigLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async upsert(restaurantId: string, input: SaveUberDeliveryConfigInput): Promise<IUberDeliveryConfig> {
    const existing = await UberDeliveryConfigModel.findOne({ restaurantId }).lean<UberDeliveryConfigLeanDocument>();
    const webhookToken = existing?.webhookToken ?? randomBytes(24).toString('hex');

    const doc = await UberDeliveryConfigModel.findOneAndUpdate(
      { restaurantId },
      { $set: { ...input, webhookToken } },
      { upsert: true, new: true },
    ).lean<UberDeliveryConfigLeanDocument>();
    return toEntity(doc as UberDeliveryConfigLeanDocument);
  }

  async delete(restaurantId: string): Promise<void> {
    await UberDeliveryConfigModel.deleteOne({ restaurantId });
  }
}
