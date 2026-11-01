import { AccountStatus, IAccountPayable } from '../../domain/entities/account.entity';
import {
  AccountPayableInput,
  IAccountPayableRepository,
} from '../../domain/repositories/account-payable.repository.interface';
import { AccountListFilters, buildAccountListQuery } from '../../domain/build-account-list-query';
import { AccountPayableModel } from '../models/account-payable.mongoose.model';

interface AccountPayableLeanDocument {
  _id: string;
  restaurantId: string;
  description: string;
  supplierId?: string;
  issueDate: Date;
  dueDate: Date;
  value: number;
  status: AccountStatus;
  paidAt?: Date;
  paidValue?: number;
}

function toEntity(doc: AccountPayableLeanDocument): IAccountPayable {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    description: doc.description,
    supplierId: doc.supplierId,
    issueDate: doc.issueDate.toISOString(),
    dueDate: doc.dueDate.toISOString(),
    value: doc.value,
    status: doc.status,
    paidAt: doc.paidAt?.toISOString(),
    paidValue: doc.paidValue,
  };
}

export class AccountPayableMongooseRepository implements IAccountPayableRepository {
  async listByRestaurant(restaurantId: string, filters?: AccountListFilters): Promise<IAccountPayable[]> {
    const docs = await AccountPayableModel.find(buildAccountListQuery(restaurantId, filters))
      .sort({ dueDate: 1 })
      .lean<AccountPayableLeanDocument[]>();
    return docs.map(toEntity);
  }

  // Achado de auditoria pré-produção (31/10/2026) — "listas sem paginação em financeiro,
  // clientes e estoque": método NOVO, separado de `listByRestaurant` acima de propósito (que
  // continua intacto, sem paginar).
  async listByRestaurantPage(
    restaurantId: string,
    pagination: { skip: number; limit: number },
    filters?: AccountListFilters,
  ): Promise<{ items: IAccountPayable[]; total: number }> {
    const query = buildAccountListQuery(restaurantId, filters);
    const [docs, total] = await Promise.all([
      AccountPayableModel.find(query).sort({ dueDate: 1 }).skip(pagination.skip).limit(pagination.limit).lean<AccountPayableLeanDocument[]>(),
      AccountPayableModel.countDocuments(query),
    ]);
    return { items: docs.map(toEntity), total };
  }

  async findById(id: string): Promise<IAccountPayable | null> {
    const doc = await AccountPayableModel.findById(id).lean<AccountPayableLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async create(restaurantId: string, input: AccountPayableInput): Promise<IAccountPayable> {
    const doc = await AccountPayableModel.create({
      restaurantId,
      description: input.description,
      supplierId: input.supplierId,
      issueDate: new Date(input.issueDate),
      dueDate: new Date(input.dueDate),
      value: input.value,
      status: 'aberto',
    });
    return toEntity(doc.toObject() as AccountPayableLeanDocument);
  }

  async update(id: string, input: AccountPayableInput): Promise<IAccountPayable> {
    const doc = await AccountPayableModel.findByIdAndUpdate(
      id,
      {
        $set: {
          description: input.description,
          supplierId: input.supplierId,
          issueDate: new Date(input.issueDate),
          dueDate: new Date(input.dueDate),
          value: input.value,
        },
      },
      { new: true },
    ).lean<AccountPayableLeanDocument>();
    return toEntity(doc as AccountPayableLeanDocument);
  }

  async markAsPaid(id: string, paidValue: number, paidAt: Date): Promise<IAccountPayable> {
    const doc = await AccountPayableModel.findByIdAndUpdate(
      id,
      { $set: { status: 'pago', paidValue, paidAt } },
      { new: true },
    ).lean<AccountPayableLeanDocument>();
    return toEntity(doc as AccountPayableLeanDocument);
  }
}
