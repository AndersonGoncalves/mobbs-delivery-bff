import { randomUUID } from 'crypto';

import { ICustomer } from '../../domain/entities/customer.entity';
import { CustomerProfileUpsert, ICustomerRepository } from '../../domain/repositories/customer.repository.interface';
import { PaymentMethod } from '../../../orders/domain/entities/order.entity';
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
  allowedPaymentMethods?: PaymentMethod[];
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
    allowedPaymentMethods: doc.allowedPaymentMethods,
    deletedAt: doc.deletedAt?.toISOString(),
  };
}


export class CustomerMongooseRepository implements ICustomerRepository {
  async findById(id: string): Promise<ICustomer | null> {
    const doc = await CustomerModel.findById(id).lean<CustomerLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findByPhone(phone: string): Promise<ICustomer | null> {
    const doc = await CustomerModel.findOne({ phone }).lean<CustomerLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async removePhoto(id: string): Promise<ICustomer | null> {
    const doc = await CustomerModel.findByIdAndUpdate(id, { $unset: { photoUrl: 1 } }, { new: true }).lean<CustomerLeanDocument>();
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

  /** specs/0155-app-totem-autoatendimento REQ-16a — ver `ICustomerRepository.createStandalone`. */
  async createStandalone(name: string, phone?: string): Promise<ICustomer> {
    const id = `totem_${randomUUID()}`;
    const doc = await CustomerModel.create({
      _id: id,
      name,
      email: `${id}@totem.mobbs-delivery.local`,
      phone,
    });
    return toEntity(doc.toObject() as CustomerLeanDocument);
  }

  async acceptTerms(id: string, version: string, profileOnInsert: CustomerProfileUpsert): Promise<ICustomer> {
    const doc = await CustomerModel.findByIdAndUpdate(
      id,
      {
        $set: { termsAcceptedAt: new Date(), termsVersionAccepted: version },
        // `$setOnInsert` — só entra em vigor se o documento ainda não existir (upsert cria um
        // novo); num update normal (documento já existente), nunca sobrescreve name/email/
        // photoUrl já persistidos.
        $setOnInsert: { name: profileOnInsert.name, email: profileOnInsert.email, photoUrl: profileOnInsert.photoUrl },
      },
      { new: true, upsert: true },
    ).lean<CustomerLeanDocument>();
    return toEntity(doc as CustomerLeanDocument);
  }

  /**
   * specs/0171-meios-pagamento-por-cliente REQ-4 — método dedicado (não reusa `upsertProfile`,
   * que é do fluxo do próprio cliente): nunca cria o documento (`upsert` ausente — a retaguarda só
   * edita um `Customer` que já existe, listado em `customers-summary` por já ter pedido).
   * `null`/array vazio limpa a restrição própria (`$unset`, mesmo motivo de `removePhoto`/
   * `anonymize` — `$set: undefined` o Mongoose ignora silenciosamente).
   */
  async updateAllowedPaymentMethods(id: string, allowedPaymentMethods: PaymentMethod[] | null): Promise<ICustomer | null> {
    const update = allowedPaymentMethods && allowedPaymentMethods.length > 0
      ? { $set: { allowedPaymentMethods } }
      : { $unset: { allowedPaymentMethods: '' } };
    const doc = await CustomerModel.findByIdAndUpdate(id, update, { new: true }).lean<CustomerLeanDocument>();
    return doc ? toEntity(doc) : null;
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
