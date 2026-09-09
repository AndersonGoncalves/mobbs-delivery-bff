import { IAddress } from '../../domain/entities/customer.entity';
import {
  AddressUpdateInput,
  IAddressRepository,
  NewAddressInput,
} from '../../domain/repositories/address.repository.interface';
import { AddressModel } from '../models/address.mongoose.model';

interface AddressLeanDocument {
  _id: string;
  customerId: string;
  label: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  isDefault: boolean;
}

function toEntity(doc: AddressLeanDocument): IAddress {
  return {
    id: doc._id,
    customerId: doc.customerId,
    label: doc.label,
    street: doc.street,
    number: doc.number,
    complement: doc.complement,
    neighborhood: doc.neighborhood,
    city: doc.city,
    state: doc.state,
    zipCode: doc.zipCode,
    isDefault: doc.isDefault,
  };
}

export class AddressMongooseRepository implements IAddressRepository {
  async listByCustomer(customerId: string): Promise<IAddress[]> {
    const docs = await AddressModel.find({ customerId }).sort({ createdAt: 1 }).lean<AddressLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findById(id: string): Promise<IAddress | null> {
    const doc = await AddressModel.findById(id).lean<AddressLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  /** REQ-6 — primeiro endereço do cliente (lista ainda vazia) já nasce padrão. */
  async create(customerId: string, input: NewAddressInput): Promise<IAddress> {
    const existingCount = await AddressModel.countDocuments({ customerId });
    const doc = await AddressModel.create({ ...input, customerId, isDefault: existingCount === 0 });
    return toEntity(doc.toObject() as AddressLeanDocument);
  }

  async update(id: string, input: AddressUpdateInput): Promise<IAddress> {
    const doc = await AddressModel.findByIdAndUpdate(id, { $set: input }, { new: true }).lean<AddressLeanDocument>();
    return toEntity(doc as AddressLeanDocument);
  }

  /** REQ-5/REQ-7 — reatribui o mais antigo restante como padrão se o removido era o padrão. */
  async remove(id: string): Promise<IAddress[]> {
    const target = await AddressModel.findById(id).lean<AddressLeanDocument>();
    if (!target) return [];

    await AddressModel.deleteOne({ _id: id });

    if (target.isDefault) {
      const remaining = await AddressModel.find({ customerId: target.customerId })
        .sort({ createdAt: 1 })
        .lean<AddressLeanDocument[]>();
      if (remaining.length > 0) {
        await AddressModel.updateOne({ _id: remaining[0]._id }, { $set: { isDefault: true } });
      }
    }

    return this.listByCustomer(target.customerId);
  }

  async setDefault(customerId: string, addressId: string): Promise<IAddress[]> {
    await AddressModel.updateMany({ customerId }, { $set: { isDefault: false } });
    await AddressModel.updateOne({ _id: addressId, customerId }, { $set: { isDefault: true } });
    return this.listByCustomer(customerId);
  }

  async removeAllByCustomer(customerId: string): Promise<void> {
    await AddressModel.deleteMany({ customerId });
  }
}
