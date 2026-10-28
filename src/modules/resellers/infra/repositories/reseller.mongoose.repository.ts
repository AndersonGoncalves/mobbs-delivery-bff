import { IReseller } from '../../domain/entities/reseller.entity';
import { IResellerRepository } from '../../domain/repositories/reseller.repository.interface';
import { ResellerModel } from '../models/reseller.mongoose.model';

interface ResellerLeanDocument {
  _id: string;
  name: string;
  email: string;
  phone: string;
  code: string;
  isActive: boolean;
  createdAt: Date;
  pixKey?: string;
}

function toEntity(doc: ResellerLeanDocument): IReseller {
  return {
    id: doc._id,
    name: doc.name,
    email: doc.email,
    phone: doc.phone,
    code: doc.code,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
    pixKey: doc.pixKey,
  };
}

export class ResellerMongooseRepository implements IResellerRepository {
  async create(input: { name: string; email: string; phone: string; code: string }): Promise<IReseller> {
    const doc = await ResellerModel.create({ ...input, email: input.email.toLowerCase(), isActive: true });
    return toEntity(doc.toObject());
  }

  async findById(id: string): Promise<IReseller | null> {
    const doc = await ResellerModel.findById(id).lean<ResellerLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findByEmail(email: string): Promise<IReseller | null> {
    const doc = await ResellerModel.findOne({ email: email.toLowerCase() }).lean<ResellerLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findByCode(code: string): Promise<IReseller | null> {
    const doc = await ResellerModel.findOne({ code }).lean<ResellerLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async listAll(): Promise<IReseller[]> {
    const docs = await ResellerModel.find().sort({ createdAt: -1 }).lean<ResellerLeanDocument[]>();
    return docs.map(toEntity);
  }

  async setActive(id: string, isActive: boolean): Promise<IReseller | null> {
    const doc = await ResellerModel.findByIdAndUpdate(id, { $set: { isActive } }, { new: true }).lean<ResellerLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async updatePixKey(id: string, pixKey: string): Promise<IReseller | null> {
    const doc = await ResellerModel.findByIdAndUpdate(id, { $set: { pixKey } }, { new: true }).lean<ResellerLeanDocument>();
    return doc ? toEntity(doc) : null;
  }
}
