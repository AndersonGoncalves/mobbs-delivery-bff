import { IProspect } from '../../domain/entities/prospect.entity';
import { IProspectRepository, ProspectInput } from '../../domain/repositories/prospect.repository.interface';
import { ProspectModel } from '../models/prospect.mongoose.model';

interface ProspectLeanDocument {
  _id: string;
  placeId: string;
  establishmentName: string;
  category: string;
  phone?: string;
  address?: string;
  latitude: number;
  longitude: number;
  rating?: number;
  contactName?: string;
  lastContactedAt?: Date;
  createdAt: Date;
}

function toEntity(doc: ProspectLeanDocument): IProspect {
  return {
    id: doc._id,
    placeId: doc.placeId,
    establishmentName: doc.establishmentName,
    category: doc.category,
    phone: doc.phone,
    address: doc.address,
    latitude: doc.latitude,
    longitude: doc.longitude,
    rating: doc.rating,
    contactName: doc.contactName,
    lastContactedAt: doc.lastContactedAt?.toISOString(),
    createdAt: doc.createdAt.toISOString(),
  };
}

export class ProspectMongooseRepository implements IProspectRepository {
  async listAll(category?: string): Promise<IProspect[]> {
    const filter = category ? { category } : {};
    const docs = await ProspectModel.find(filter).sort({ createdAt: -1 }).lean<ProspectLeanDocument[]>();
    return docs.map(toEntity);
  }

  async findByPlaceId(placeId: string): Promise<IProspect | null> {
    const doc = await ProspectModel.findOne({ placeId }).lean<ProspectLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async create(input: ProspectInput): Promise<IProspect> {
    const doc = await ProspectModel.create(input);
    return toEntity(doc.toObject() as ProspectLeanDocument);
  }

  async findById(id: string): Promise<IProspect | null> {
    const doc = await ProspectModel.findById(id).lean<ProspectLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async markContacted(id: string, contactedAt: string): Promise<void> {
    await ProspectModel.updateOne({ _id: id }, { $set: { lastContactedAt: new Date(contactedAt) } });
  }
}
