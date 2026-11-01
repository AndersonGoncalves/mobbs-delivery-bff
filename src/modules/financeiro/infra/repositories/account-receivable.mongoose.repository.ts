import { AccountStatus, IAccountReceivable } from '../../domain/entities/account.entity';
import {
  AccountReceivableInput,
  IAccountReceivableRepository,
} from '../../domain/repositories/account-receivable.repository.interface';
import { AccountListFilters, buildAccountListQuery } from '../../domain/build-account-list-query';
import { AccountReceivableModel } from '../models/account-receivable.mongoose.model';

interface AccountReceivableLeanDocument {
  _id: string;
  restaurantId: string;
  description: string;
  customerId?: string;
  issueDate: Date;
  dueDate: Date;
  value: number;
  status: AccountStatus;
  receivedAt?: Date;
  receivedValue?: number;
}

function toEntity(doc: AccountReceivableLeanDocument): IAccountReceivable {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    description: doc.description,
    customerId: doc.customerId,
    issueDate: doc.issueDate.toISOString(),
    dueDate: doc.dueDate.toISOString(),
    value: doc.value,
    status: doc.status,
    receivedAt: doc.receivedAt?.toISOString(),
    receivedValue: doc.receivedValue,
  };
}

export class AccountReceivableMongooseRepository implements IAccountReceivableRepository {
  async listByRestaurant(restaurantId: string, filters?: AccountListFilters): Promise<IAccountReceivable[]> {
    const docs = await AccountReceivableModel.find(buildAccountListQuery(restaurantId, filters))
      .sort({ dueDate: 1 })
      .lean<AccountReceivableLeanDocument[]>();
    return docs.map(toEntity);
  }

  // Achado de auditoria pré-produção (31/10/2026) — "listas sem paginação em financeiro,
  // clientes e estoque": método NOVO, separado de `listByRestaurant` acima de propósito (que
  // continua intacto, sem paginar).
  async listByRestaurantPage(
    restaurantId: string,
    pagination: { skip: number; limit: number },
    filters?: AccountListFilters,
  ): Promise<{ items: IAccountReceivable[]; total: number }> {
    const query = buildAccountListQuery(restaurantId, filters);
    const [docs, total] = await Promise.all([
      AccountReceivableModel.find(query).sort({ dueDate: 1 }).skip(pagination.skip).limit(pagination.limit).lean<AccountReceivableLeanDocument[]>(),
      AccountReceivableModel.countDocuments(query),
    ]);
    return { items: docs.map(toEntity), total };
  }

  async findById(id: string): Promise<IAccountReceivable | null> {
    const doc = await AccountReceivableModel.findById(id).lean<AccountReceivableLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async create(restaurantId: string, input: AccountReceivableInput): Promise<IAccountReceivable> {
    const doc = await AccountReceivableModel.create({
      restaurantId,
      description: input.description,
      customerId: input.customerId,
      issueDate: new Date(input.issueDate),
      dueDate: new Date(input.dueDate),
      value: input.value,
      status: 'aberto',
    });
    return toEntity(doc.toObject() as AccountReceivableLeanDocument);
  }

  async update(id: string, input: AccountReceivableInput): Promise<IAccountReceivable> {
    const doc = await AccountReceivableModel.findByIdAndUpdate(
      id,
      {
        $set: {
          description: input.description,
          customerId: input.customerId,
          issueDate: new Date(input.issueDate),
          dueDate: new Date(input.dueDate),
          value: input.value,
        },
      },
      { new: true },
    ).lean<AccountReceivableLeanDocument>();
    return toEntity(doc as AccountReceivableLeanDocument);
  }

  async markAsReceived(id: string, receivedValue: number, receivedAt: Date): Promise<IAccountReceivable> {
    const doc = await AccountReceivableModel.findByIdAndUpdate(
      id,
      { $set: { status: 'pago', receivedValue, receivedAt } },
      { new: true },
    ).lean<AccountReceivableLeanDocument>();
    return toEntity(doc as AccountReceivableLeanDocument);
  }
}
