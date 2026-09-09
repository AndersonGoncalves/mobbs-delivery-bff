import { ICustomer } from '../../domain/entities/customer.entity';
import { CustomerProfileUpsert, ICustomerRepository } from '../../domain/repositories/customer.repository.interface';
import { CustomerModel } from '../models/customer.mongoose.model';

interface CustomerLeanDocument {
  _id: string;
  name: string;
  email: string;
  photoUrl?: string;
  phone?: string;
  document?: string;
}

function toEntity(doc: CustomerLeanDocument): ICustomer {
  return {
    id: doc._id,
    name: doc.name,
    email: doc.email,
    photoUrl: doc.photoUrl,
    phone: doc.phone,
    document: doc.document,
  };
}

export class CustomerMongooseRepository implements ICustomerRepository {
  async findById(id: string): Promise<ICustomer | null> {
    const doc = await CustomerModel.findById(id).lean<CustomerLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async upsertProfile(id: string, patch: CustomerProfileUpsert): Promise<ICustomer> {
    const doc = await CustomerModel.findByIdAndUpdate(
      id,
      { $set: patch },
      { new: true, upsert: true },
    ).lean<CustomerLeanDocument>();
    return toEntity(doc as CustomerLeanDocument);
  }
}
