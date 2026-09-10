import { CouponDiscountType, ICoupon } from '../../domain/entities/coupon.entity';
import { CouponInput, ICouponRepository } from '../../domain/repositories/coupon.repository.interface';
import { CouponModel } from '../models/coupon.mongoose.model';

interface CouponLeanDocument {
  _id: string;
  restaurantId: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderValue?: number;
  validFrom: Date;
  validUntil?: Date;
  usageLimit?: number;
  usageLimitPerCustomer?: number;
  usageCount: number;
  isActive: boolean;
}

function toEntity(doc: CouponLeanDocument): ICoupon {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    code: doc.code,
    discountType: doc.discountType,
    discountValue: doc.discountValue,
    minOrderValue: doc.minOrderValue,
    validFrom: doc.validFrom.toISOString(),
    validUntil: doc.validUntil?.toISOString(),
    usageLimit: doc.usageLimit,
    usageLimitPerCustomer: doc.usageLimitPerCustomer,
    usageCount: doc.usageCount,
    isActive: doc.isActive,
  };
}

function toSetPayload(input: CouponInput) {
  return {
    code: input.code,
    discountType: input.discountType,
    discountValue: input.discountValue,
    minOrderValue: input.minOrderValue,
    validFrom: new Date(input.validFrom),
    validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
    usageLimit: input.usageLimit,
    usageLimitPerCustomer: input.usageLimitPerCustomer,
    isActive: input.isActive,
  };
}

export class CouponMongooseRepository implements ICouponRepository {
  async findManyByRestaurant(restaurantId: string): Promise<ICoupon[]> {
    const docs = await CouponModel.find({ restaurantId }).sort({ createdAt: -1 }).lean<CouponLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findById(id: string): Promise<ICoupon | null> {
    const doc = await CouponModel.findById(id).lean<CouponLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findByCode(restaurantId: string, code: string): Promise<ICoupon | null> {
    const doc = await CouponModel.findOne({ restaurantId, code }).lean<CouponLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async create(restaurantId: string, input: CouponInput): Promise<ICoupon> {
    const doc = await CouponModel.create({ restaurantId, ...toSetPayload(input), usageCount: 0 });
    return toEntity(doc.toObject() as CouponLeanDocument);
  }

  async update(id: string, input: CouponInput): Promise<ICoupon> {
    const doc = await CouponModel.findByIdAndUpdate(
      id,
      { $set: toSetPayload(input) },
      { new: true },
    ).lean<CouponLeanDocument>();
    return toEntity(doc as CouponLeanDocument);
  }

  /**
   * specs/0022-cupons-desconto REQ-4 — mesmo espírito de
   * `PurchaseOrderMongooseRepository.markAsReceivedIfOpen` (specs/0015): sem transação
   * multi-documento (MongoDB standalone, sem replica set, `docs/architecture/patterns.md`
   * §16.6.1), a garantia de nunca ultrapassar `usageLimit` sob concorrência vem inteira do filtro
   * do `findOneAndUpdate` — `$expr` compara dois campos do **mesmo** documento (`usageCount` vs
   * `usageLimit`) atomicamente no servidor antes do `$inc`, então só uma entre N requisições
   * concorrentes pro último uso disponível consegue incrementar; as demais recebem `null`.
   * Cupom sem `usageLimit` configurado (sem limite) sempre incrementa.
   */
  async incrementUsageIfWithinLimit(id: string): Promise<ICoupon | null> {
    const doc = await CouponModel.findOneAndUpdate(
      {
        _id: id,
        $or: [{ usageLimit: { $exists: false } }, { usageLimit: null }, { $expr: { $lt: ['$usageCount', '$usageLimit'] } }],
      },
      { $inc: { usageCount: 1 } },
      { new: true },
    ).lean<CouponLeanDocument>();
    return doc ? toEntity(doc) : null;
  }
}
