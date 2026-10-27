import { IResellerProspect, ResellerProspectStatus } from '../../domain/entities/reseller-prospect.entity';
import { IResellerProspectRepository } from '../../domain/repositories/reseller-prospect.repository.interface';
import { ResellerProspectModel } from '../models/reseller-prospect.mongoose.model';

interface ResellerProspectLeanDocument {
  _id: string;
  resellerId: string;
  establishmentName: string;
  phone?: string;
  address?: string;
  notes?: string;
  status: ResellerProspectStatus;
  convertedRestaurantId?: string;
  createdAt: Date;
}

function toEntity(doc: ResellerProspectLeanDocument): IResellerProspect {
  return {
    id: doc._id,
    resellerId: doc.resellerId,
    establishmentName: doc.establishmentName,
    phone: doc.phone,
    address: doc.address,
    notes: doc.notes,
    status: doc.status,
    convertedRestaurantId: doc.convertedRestaurantId,
    createdAt: doc.createdAt,
  };
}

export class ResellerProspectMongooseRepository implements IResellerProspectRepository {
  async create(input: { resellerId: string; establishmentName: string; phone?: string; address?: string; notes?: string }): Promise<IResellerProspect> {
    const doc = await ResellerProspectModel.create({ ...input, status: 'em_prospeccao' });
    return toEntity(doc.toObject());
  }

  async findById(id: string): Promise<IResellerProspect | null> {
    const doc = await ResellerProspectModel.findById(id).lean<ResellerProspectLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async listByReseller(resellerId: string): Promise<IResellerProspect[]> {
    const docs = await ResellerProspectModel.find({ resellerId }).sort({ createdAt: -1 }).lean<ResellerProspectLeanDocument[]>();
    return docs.map(toEntity);
  }

  async update(
    id: string,
    resellerId: string,
    input: { establishmentName: string; phone?: string; address?: string; notes?: string },
  ): Promise<IResellerProspect | null> {
    const doc = await ResellerProspectModel.findOneAndUpdate(
      { _id: id, resellerId, status: 'em_prospeccao' },
      { $set: input },
      { new: true },
    ).lean<ResellerProspectLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async delete(id: string, resellerId: string): Promise<boolean> {
    const result = await ResellerProspectModel.deleteOne({ _id: id, resellerId, status: 'em_prospeccao' });
    return result.deletedCount > 0;
  }

  async markConverted(id: string, resellerId: string, convertedRestaurantId: string): Promise<IResellerProspect | null> {
    const doc = await ResellerProspectModel.findOneAndUpdate(
      { _id: id, resellerId, status: 'em_prospeccao' },
      { $set: { status: 'convertido', convertedRestaurantId } },
      { new: true },
    ).lean<ResellerProspectLeanDocument>();
    return doc ? toEntity(doc) : null;
  }
}
