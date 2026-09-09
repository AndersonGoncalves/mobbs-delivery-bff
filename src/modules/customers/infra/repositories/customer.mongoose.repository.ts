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
  termsAcceptedAt?: Date;
  termsVersionAccepted?: string;
  deletedAt?: Date;
}

function toEntity(doc: CustomerLeanDocument): ICustomer {
  return {
    id: doc._id,
    name: doc.name,
    email: doc.email,
    photoUrl: doc.photoUrl,
    phone: doc.phone,
    document: doc.document,
    termsAcceptedAt: doc.termsAcceptedAt?.toISOString(),
    termsVersionAccepted: doc.termsVersionAccepted,
    deletedAt: doc.deletedAt?.toISOString(),
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

  async acceptTerms(id: string, version: string): Promise<ICustomer> {
    const doc = await CustomerModel.findByIdAndUpdate(
      id,
      { $set: { termsAcceptedAt: new Date(), termsVersionAccepted: version } },
      { new: true },
    ).lean<CustomerLeanDocument>();
    return toEntity(doc as CustomerLeanDocument);
  }

  /** REQ-6 — `$unset` (não `$set: undefined`, que o Mongoose ignora silenciosamente) pra
   * remover `phone`/`document`/`photoUrl` de verdade. */
  async anonymize(id: string): Promise<void> {
    await CustomerModel.findByIdAndUpdate(id, {
      $set: { name: 'Cliente removido', email: `${id}@removido.mobbs-delivery.local`, deletedAt: new Date() },
      $unset: { phone: '', document: '', photoUrl: '' },
    });
  }
}
