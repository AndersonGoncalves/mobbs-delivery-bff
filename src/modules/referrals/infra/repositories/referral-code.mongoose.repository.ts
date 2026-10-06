import { IReferralCodeRepository } from '../../domain/repositories/referral-code.repository.interface';
import { CustomerReferralCodeModel } from '../models/customer-referral-code.mongoose.model';

export class ReferralCodeMongooseRepository implements IReferralCodeRepository {
  async findByCustomerId(customerId: string): Promise<string | null> {
    const doc = await CustomerReferralCodeModel.findById(customerId).lean<{ code: string }>();
    return doc?.code ?? null;
  }

  async findCustomerIdByCode(code: string): Promise<string | null> {
    const doc = await CustomerReferralCodeModel.findOne({ code }).lean<{ _id: string }>();
    return doc?._id ?? null;
  }

  async save(customerId: string, code: string): Promise<void> {
    await CustomerReferralCodeModel.updateOne({ _id: customerId }, { $setOnInsert: { _id: customerId }, $set: { code } }, { upsert: true });
  }
}
