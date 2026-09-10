import { ISupplier } from '../../domain/entities/supplier.entity';
import { ISupplierRepository, SupplierInput } from '../../domain/repositories/supplier.repository.interface';
import { SupplierModel } from '../models/supplier.mongoose.model';

interface SupplierLeanDocument {
  _id: string;
  restaurantId: string;
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
}

function toEntity(doc: SupplierLeanDocument): ISupplier {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    name: doc.name,
    document: doc.document,
    phone: doc.phone,
    email: doc.email,
    isActive: doc.isActive,
  };
}

export class SupplierMongooseRepository implements ISupplierRepository {
  async listByRestaurant(restaurantId: string): Promise<ISupplier[]> {
    const docs = await SupplierModel.find({ restaurantId }).sort({ name: 1 }).lean<SupplierLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findById(id: string): Promise<ISupplier | null> {
    const doc = await SupplierModel.findById(id).lean<SupplierLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async create(restaurantId: string, input: SupplierInput): Promise<ISupplier> {
    const doc = await SupplierModel.create({ restaurantId, ...input, isActive: true });
    return toEntity(doc.toObject() as SupplierLeanDocument);
  }

  async update(id: string, input: SupplierInput): Promise<ISupplier> {
    const doc = await SupplierModel.findByIdAndUpdate(id, { $set: input }, { new: true }).lean<SupplierLeanDocument>();
    return toEntity(doc as SupplierLeanDocument);
  }

  async setActive(id: string, isActive: boolean): Promise<ISupplier> {
    const doc = await SupplierModel.findByIdAndUpdate(
      id,
      { $set: { isActive } },
      { new: true },
    ).lean<SupplierLeanDocument>();
    return toEntity(doc as SupplierLeanDocument);
  }
}
