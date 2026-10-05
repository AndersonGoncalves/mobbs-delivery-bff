import { RestaurantModel } from '../../../restaurants/infra/models/restaurant.mongoose.model';
import { generateReferralCode } from '../../domain/generate-referral-code';

/**
 * specs/0043-programa-indicacao REQ-1 — restaurantes cadastrados antes desta spec não têm
 * `referralCode`. Roda a cada início do servidor (mesmo padrão de `migrateOperatorRolesToDono`);
 * idempotente — só mexe em quem ainda não tem código.
 */
export async function backfillReferralCodes(): Promise<void> {
  const pending = await RestaurantModel.find({ referralCode: { $exists: false } }).select('_id').lean<{ _id: string }[]>();
  for (const restaurant of pending) {
    let code = generateReferralCode();
    while (await RestaurantModel.exists({ referralCode: code })) {
      code = generateReferralCode();
    }
    await RestaurantModel.updateOne({ _id: restaurant._id }, { $set: { referralCode: code } });
  }
}
