import { IRestaurantOperator, OperatorRole } from '../../domain/entities/restaurant-operator.entity';
import { IRestaurantOperatorRepository } from '../../domain/repositories/restaurant-operator.repository.interface';
import { RestaurantOperatorModel } from '../models/restaurant-operator.mongoose.model';

interface RestaurantOperatorLeanDocument {
  _id: string;
  restaurantId: string;
  email: string;
  name?: string;
  whatsapp?: string;
  photoUrl?: string;
  role?: OperatorRole;
  hasFullAccess?: boolean;
  isActive: boolean;
  createdAt: Date;
}

function toEntity(doc: RestaurantOperatorLeanDocument): IRestaurantOperator {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    email: doc.email,
    name: doc.name,
    whatsapp: doc.whatsapp,
    photoUrl: doc.photoUrl,
    // specs/0021-papeis-operador REQ-7 — rede de segurança além da migração de startup
    // (`migrateOperatorRolesToDono`): `.lean()` nunca aplica `default` do schema na leitura, só
    // no `save()`/`create()`, então um documento lido antes da migração rodar (ou num teste que
    // não passa por ela) ainda cai em `dono`, nunca em `undefined`.
    role: doc.role ?? 'dono',
    hasFullAccess: doc.hasFullAccess ?? false,
    isActive: doc.isActive,
    createdAt: doc.createdAt,
  };
}

export class RestaurantOperatorMongooseRepository implements IRestaurantOperatorRepository {
  async findActiveOperatorByEmail(email: string): Promise<IRestaurantOperator | null> {
    const doc = await RestaurantOperatorModel.findOne({ email, isActive: true }).lean<RestaurantOperatorLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findByEmail(email: string): Promise<IRestaurantOperator | null> {
    const doc = await RestaurantOperatorModel.findOne({ email }).lean<RestaurantOperatorLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async findActiveByEmailInOtherRestaurant(email: string, restaurantId: string): Promise<IRestaurantOperator | null> {
    const doc = await RestaurantOperatorModel.findOne({ email, isActive: true, restaurantId: { $ne: restaurantId } }).lean<RestaurantOperatorLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async listByRestaurant(restaurantId: string): Promise<IRestaurantOperator[]> {
    const docs = await RestaurantOperatorModel.find({ restaurantId }).lean<RestaurantOperatorLeanDocument[]>();
    return docs.map(toEntity);
  }

  async countActiveByRestaurant(restaurantId: string): Promise<number> {
    return RestaurantOperatorModel.countDocuments({ restaurantId, isActive: true });
  }

  async countActiveByRestaurantAndRole(restaurantId: string, role: OperatorRole): Promise<number> {
    return RestaurantOperatorModel.countDocuments({ restaurantId, role, isActive: true });
  }

  async create(
    restaurantId: string,
    email: string,
    role: OperatorRole,
    name: string,
    whatsapp?: string,
    photoUrl?: string,
  ): Promise<IRestaurantOperator> {
    const doc = await RestaurantOperatorModel.create({ restaurantId, email, role, name, whatsapp, photoUrl });
    return toEntity(doc.toObject());
  }

  async deactivate(id: string): Promise<void> {
    await RestaurantOperatorModel.findByIdAndUpdate(id, { $set: { isActive: false } });
  }

  async findById(id: string): Promise<IRestaurantOperator | null> {
    const doc = await RestaurantOperatorModel.findById(id).lean<RestaurantOperatorLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async updateRole(id: string, role: OperatorRole): Promise<void> {
    await RestaurantOperatorModel.findByIdAndUpdate(id, {
      $set: { role, ...(role === 'gerente' ? {} : { hasFullAccess: false }) },
    });
  }

  async updateFullAccess(id: string, hasFullAccess: boolean): Promise<void> {
    await RestaurantOperatorModel.findByIdAndUpdate(id, { $set: { hasFullAccess } });
  }

  async updateProfile(id: string, profile: { name: string; whatsapp?: string; photoUrl?: string | null }): Promise<void> {
    const { photoUrl, ...fields } = profile;
    await RestaurantOperatorModel.findByIdAndUpdate(id, {
      $set: { ...fields, ...(typeof photoUrl === 'string' ? { photoUrl } : {}) },
      ...(photoUrl === null ? { $unset: { photoUrl: 1 } } : {}),
    });
  }
}
