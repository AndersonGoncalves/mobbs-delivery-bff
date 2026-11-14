import { randomBytes } from 'crypto';

import { IFiscalConfig } from '../../domain/entities/fiscal-config.entity';
import { IFiscalConfigRepository, SaveFiscalConfigInput } from '../../domain/repositories/fiscal-config.repository.interface';
import { FiscalConfigModel } from '../models/fiscal-config.mongoose.model';

interface FiscalConfigLeanDocument {
  restaurantId: string;
  focusNfeToken: string;
  environment: IFiscalConfig['environment'];
  documentType: IFiscalConfig['documentType'];
  productionEnabled: boolean;
  autoEmitEnabled: boolean;
  webhookToken: string;
  cnpj: string;
  taxRegime?: IFiscalConfig['taxRegime'];
  createdAt: Date;
  updatedAt: Date;
}

function toEntity(doc: FiscalConfigLeanDocument): IFiscalConfig {
  return {
    restaurantId: doc.restaurantId,
    focusNfeToken: doc.focusNfeToken,
    environment: doc.environment,
    documentType: doc.documentType,
    productionEnabled: doc.productionEnabled,
    autoEmitEnabled: doc.autoEmitEnabled,
    webhookToken: doc.webhookToken,
    cnpj: doc.cnpj,
    taxRegime: doc.taxRegime,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export class FiscalConfigMongooseRepository implements IFiscalConfigRepository {
  async findByRestaurantId(restaurantId: string): Promise<IFiscalConfig | null> {
    const doc = await FiscalConfigModel.findOne({ restaurantId }).lean<FiscalConfigLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async upsert(restaurantId: string, input: SaveFiscalConfigInput): Promise<IFiscalConfig> {
    const existing = await FiscalConfigModel.findOne({ restaurantId }).lean<FiscalConfigLeanDocument>();
    const webhookToken = existing?.webhookToken ?? randomBytes(24).toString('hex');

    const doc = await FiscalConfigModel.findOneAndUpdate(
      { restaurantId },
      { $set: { ...input, webhookToken }, $setOnInsert: { productionEnabled: false, autoEmitEnabled: true } },
      { upsert: true, new: true },
    ).lean<FiscalConfigLeanDocument>();
    return toEntity(doc as FiscalConfigLeanDocument);
  }

  async setProductionEnabled(restaurantId: string, enabled: boolean): Promise<IFiscalConfig> {
    const doc = await FiscalConfigModel.findOneAndUpdate(
      { restaurantId },
      { $set: { productionEnabled: enabled } },
      { new: true },
    ).lean<FiscalConfigLeanDocument>();
    if (!doc) throw new Error('Configuração fiscal não encontrada pra este restaurante');
    return toEntity(doc);
  }

  /** specs/0204-controle-emissao-fiscal-automatica — "botão" irmão de `setProductionEnabled`. */
  async setAutoEmitEnabled(restaurantId: string, enabled: boolean): Promise<IFiscalConfig> {
    const doc = await FiscalConfigModel.findOneAndUpdate(
      { restaurantId },
      { $set: { autoEmitEnabled: enabled } },
      { new: true },
    ).lean<FiscalConfigLeanDocument>();
    if (!doc) throw new Error('Configuração fiscal não encontrada pra este restaurante');
    return toEntity(doc);
  }

  async delete(restaurantId: string): Promise<void> {
    await FiscalConfigModel.deleteOne({ restaurantId });
  }
}
