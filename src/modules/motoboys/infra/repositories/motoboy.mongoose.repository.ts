import { IMotoboy } from '../../domain/entities/motoboy.entity';
import { IMotoboyRepository, MotoboyInput } from '../../domain/repositories/motoboy.repository.interface';
import { MotoboyModel } from '../models/motoboy.mongoose.model';

interface MotoboyLeanDocument {
  _id: string;
  restaurantId: string;
  name: string;
  whatsapp: string;
  canMarkAsDelivered: boolean;
  isActive: boolean;
}

function toEntity(doc: MotoboyLeanDocument): IMotoboy {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    name: doc.name,
    whatsapp: doc.whatsapp,
    canMarkAsDelivered: doc.canMarkAsDelivered,
    isActive: doc.isActive,
  };
}

export class MotoboyMongooseRepository implements IMotoboyRepository {
  async listByRestaurant(restaurantId: string): Promise<IMotoboy[]> {
    const docs = await MotoboyModel.find({ restaurantId }).sort({ name: 1 }).lean<MotoboyLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findById(id: string): Promise<IMotoboy | null> {
    const doc = await MotoboyModel.findById(id).lean<MotoboyLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async create(restaurantId: string, input: MotoboyInput): Promise<IMotoboy> {
    const doc = await MotoboyModel.create({ restaurantId, ...input, isActive: true });
    return toEntity(doc.toObject() as MotoboyLeanDocument);
  }

  async update(id: string, input: MotoboyInput): Promise<IMotoboy> {
    const doc = await MotoboyModel.findByIdAndUpdate(id, { $set: input }, { new: true }).lean<MotoboyLeanDocument>();
    return toEntity(doc as MotoboyLeanDocument);
  }

  async setActive(id: string, isActive: boolean): Promise<IMotoboy> {
    const doc = await MotoboyModel.findByIdAndUpdate(
      id,
      { $set: { isActive } },
      { new: true },
    ).lean<MotoboyLeanDocument>();
    return toEntity(doc as MotoboyLeanDocument);
  }
}
