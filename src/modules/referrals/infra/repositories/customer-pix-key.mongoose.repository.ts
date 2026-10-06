import { ICustomerPixKeyRecord, ICustomerPixKeyRepository } from '../../domain/repositories/customer-pix-key.repository.interface';
import { CustomerPixKeyModel } from '../models/customer-pix-key.mongoose.model';

interface LeanDocument {
  _id: string;
  type: ICustomerPixKeyRecord['type'];
  encryptedValue: string;
  termsVersionAccepted: string;
  acceptedAt: Date;
  updatedAt: Date;
}

export class CustomerPixKeyMongooseRepository implements ICustomerPixKeyRepository {
  async findByCustomerId(customerId: string): Promise<ICustomerPixKeyRecord | null> {
    const doc = await CustomerPixKeyModel.findById(customerId).lean<LeanDocument>();
    if (!doc) return null;
    return {
      customerId: doc._id,
      type: doc.type,
      encryptedValue: doc.encryptedValue,
      termsVersionAccepted: doc.termsVersionAccepted,
      acceptedAt: doc.acceptedAt,
      updatedAt: doc.updatedAt,
    };
  }

  async save(record: ICustomerPixKeyRecord): Promise<void> {
    await CustomerPixKeyModel.updateOne(
      { _id: record.customerId },
      {
        $set: {
          type: record.type,
          encryptedValue: record.encryptedValue,
          termsVersionAccepted: record.termsVersionAccepted,
          acceptedAt: record.acceptedAt,
          updatedAt: record.updatedAt,
        },
      },
      { upsert: true },
    );
  }

  async deleteByCustomerId(customerId: string): Promise<void> {
    await CustomerPixKeyModel.deleteOne({ _id: customerId });
  }
}
