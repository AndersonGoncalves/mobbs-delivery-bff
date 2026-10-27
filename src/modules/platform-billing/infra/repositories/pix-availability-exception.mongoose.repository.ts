import type { IPixAvailabilityException } from '../../domain/entities/pix-availability-exception.entity';
import type { IPixAvailabilityExceptionRepository } from '../../domain/repositories/pix-availability-exception.repository.interface';
import { PixAvailabilityExceptionModel } from '../models/pix-availability-exception.mongoose.model';

type ExceptionLeanDocument = Omit<IPixAvailabilityException, 'id'> & { _id: string };

function toEntity(doc: ExceptionLeanDocument): IPixAvailabilityException {
  return {
    id: doc._id,
    obligationId: doc.obligationId,
    firstValidPixAvailableAt: doc.firstValidPixAvailableAt,
    graceDeadline: doc.graceDeadline,
    createdAt: doc.createdAt,
  };
}

export class PixAvailabilityExceptionMongooseRepository implements IPixAvailabilityExceptionRepository {
  async findByObligationId(obligationId: string): Promise<IPixAvailabilityException | null> {
    const doc = await PixAvailabilityExceptionModel.findOne({ obligationId }).lean<ExceptionLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async createIfAbsent(obligationId: string, firstValidPixAvailableAt: Date, graceDeadline: Date): Promise<IPixAvailabilityException> {
    const doc = await PixAvailabilityExceptionModel.findOneAndUpdate(
      { obligationId },
      { $setOnInsert: { obligationId, firstValidPixAvailableAt, graceDeadline } },
      { upsert: true, new: true },
    ).lean<ExceptionLeanDocument>();
    return toEntity(doc as ExceptionLeanDocument);
  }
}
