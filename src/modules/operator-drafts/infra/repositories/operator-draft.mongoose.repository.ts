import { IOperatorDraft, OperatorDraftPatch, emptyDraftPatch } from '../../domain/entities/operator-draft.entity';
import { IOperatorDraftRepository, OperatorDraftWriteResult } from '../../domain/repositories/operator-draft.repository.interface';
import { OperatorDraftModel } from '../models/operator-draft.mongoose.model';

interface OperatorDraftLeanDocument {
  _id: string;
  restaurantId: string;
  operatorId: string;
  slot: 1 | 2;
  revision: number;
  modality: IOperatorDraft['modality'];
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryNeighborhood?: string;
  items: IOperatorDraft['items'];
  notes?: string;
  couponCode?: string;
  adjustment?: IOperatorDraft['adjustment'];
  paymentMethod?: IOperatorDraft['paymentMethod'];
  cashChangeFor?: number;
  status: IOperatorDraft['status'];
  orderId?: string;
  finalizedClientRequestId?: string;
  lastEditedFrom?: IOperatorDraft['lastEditedFrom'];
  updatedAt: Date;
}

function toEntity(doc: OperatorDraftLeanDocument): IOperatorDraft {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    operatorId: doc.operatorId,
    slot: doc.slot,
    revision: doc.revision,
    modality: doc.modality,
    customerId: doc.customerId,
    customerName: doc.customerName,
    customerPhone: doc.customerPhone,
    deliveryAddress: doc.deliveryAddress,
    deliveryNeighborhood: doc.deliveryNeighborhood,
    items: doc.items ?? [],
    notes: doc.notes,
    couponCode: doc.couponCode,
    adjustment: doc.adjustment,
    paymentMethod: doc.paymentMethod,
    cashChangeFor: doc.cashChangeFor,
    status: doc.status,
    orderId: doc.orderId,
    finalizedClientRequestId: doc.finalizedClientRequestId,
    lastEditedFrom: doc.lastEditedFrom,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * specs/0174-pdv-extensao-chrome-lateral — toda escrita condicional (`save`/`clear`/
 * `tryClaimForFinalize`) é um único `findOneAndUpdate` atômico no Mongo com o filtro incluindo
 * `revision`/`status` esperados; não há transação nem lock explícito porque o documento é a
 * própria unidade de concorrência (um rascunho = um documento). Isso é o que torna REQ-11/REQ-23
 * reais e não apenas "botão desabilitado na tela" (plan.md §6).
 */
export class OperatorDraftMongooseRepository implements IOperatorDraftRepository {
  async findOrCreate(restaurantId: string, operatorId: string, slot: 1 | 2): Promise<IOperatorDraft> {
    const doc = await OperatorDraftModel.findOneAndUpdate(
      { restaurantId, operatorId, slot },
      { $setOnInsert: { restaurantId, operatorId, slot, revision: 0, status: 'draft', ...emptyDraftPatch(), updatedAt: new Date() } },
      { upsert: true, new: true },
    ).lean<OperatorDraftLeanDocument>();
    return toEntity(doc!);
  }

  async findBySlot(restaurantId: string, operatorId: string, slot: 1 | 2): Promise<IOperatorDraft | null> {
    const doc = await OperatorDraftModel.findOne({ restaurantId, operatorId, slot }).lean<OperatorDraftLeanDocument>();
    return doc ? toEntity(doc) : null;
  }

  async save(
    restaurantId: string,
    operatorId: string,
    slot: 1 | 2,
    expectedRevision: number,
    patch: OperatorDraftPatch,
  ): Promise<OperatorDraftWriteResult> {
    const updated = await OperatorDraftModel.findOneAndUpdate(
      { restaurantId, operatorId, slot, revision: expectedRevision, status: 'draft' },
      { $set: { ...patch, revision: expectedRevision + 1, updatedAt: new Date() } },
      { new: true },
    ).lean<OperatorDraftLeanDocument>();
    if (updated) return { ok: true, draft: toEntity(updated) };
    return { ok: false, draft: await this.findOrCreate(restaurantId, operatorId, slot) };
  }

  async clear(restaurantId: string, operatorId: string, slot: 1 | 2, expectedRevision: number): Promise<OperatorDraftWriteResult> {
    const updated = await OperatorDraftModel.findOneAndUpdate(
      { restaurantId, operatorId, slot, revision: expectedRevision, status: { $in: ['draft', 'finalized'] } },
      {
        $set: { ...emptyDraftPatch(), status: 'draft', revision: expectedRevision + 1, updatedAt: new Date() },
        $unset: {
          customerId: 1,
          customerName: 1,
          customerPhone: 1,
          deliveryAddress: 1,
          deliveryNeighborhood: 1,
          notes: 1,
          couponCode: 1,
          adjustment: 1,
          paymentMethod: 1,
          cashChangeFor: 1,
          orderId: 1,
          finalizedClientRequestId: 1,
          lastEditedFrom: 1,
        },
      },
      { new: true },
    ).lean<OperatorDraftLeanDocument>();
    if (updated) return { ok: true, draft: toEntity(updated) };
    return { ok: false, draft: await this.findOrCreate(restaurantId, operatorId, slot) };
  }

  async tryClaimForFinalize(restaurantId: string, operatorId: string, slot: 1 | 2, expectedRevision: number): Promise<OperatorDraftWriteResult> {
    const updated = await OperatorDraftModel.findOneAndUpdate(
      { restaurantId, operatorId, slot, revision: expectedRevision, status: 'draft' },
      { $set: { status: 'finalizing', revision: expectedRevision + 1, updatedAt: new Date() } },
      { new: true },
    ).lean<OperatorDraftLeanDocument>();
    if (updated) return { ok: true, draft: toEntity(updated) };
    return { ok: false, draft: await this.findOrCreate(restaurantId, operatorId, slot) };
  }

  async markFinalized(restaurantId: string, operatorId: string, slot: 1 | 2, orderId: string, clientRequestId: string): Promise<IOperatorDraft> {
    const updated = await OperatorDraftModel.findOneAndUpdate(
      { restaurantId, operatorId, slot },
      { $set: { status: 'finalized', orderId, finalizedClientRequestId: clientRequestId, updatedAt: new Date() } },
      { new: true },
    ).lean<OperatorDraftLeanDocument>();
    return toEntity(updated!);
  }

  async rollbackClaim(restaurantId: string, operatorId: string, slot: 1 | 2): Promise<IOperatorDraft> {
    const updated = await OperatorDraftModel.findOneAndUpdate(
      { restaurantId, operatorId, slot, status: 'finalizing' },
      { $set: { status: 'draft', updatedAt: new Date() } },
      { new: true },
    ).lean<OperatorDraftLeanDocument>();
    return toEntity(updated ?? (await OperatorDraftModel.findOne({ restaurantId, operatorId, slot }).lean<OperatorDraftLeanDocument>())!);
  }
}
