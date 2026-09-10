import {
  CashMovementType,
  CashRegisterStatus,
  ICashMovementEntry,
  ICashRegisterSession,
} from '../../domain/entities/cash-register.entity';
import {
  CloseCashRegisterResult,
  ICashRegisterRepository,
  NewCashMovementInput,
} from '../../domain/repositories/cash-register.repository.interface';
import { CashMovementEntryModel } from '../models/cash-movement-entry.mongoose.model';
import { CashRegisterSessionModel } from '../models/cash-register-session.mongoose.model';

interface SessionLeanDocument {
  _id: string;
  restaurantId: string;
  openedAt: Date;
  closedAt?: Date;
  openingBalance: number;
  closingBalance?: number;
  status: CashRegisterStatus;
  openedBy?: string;
  closedBy?: string;
}

interface MovementLeanDocument {
  _id: string;
  cashRegisterSessionId: string;
  type: CashMovementType;
  amount: number;
  description: string;
  orderId?: string;
  createdAt: Date;
}

function toSessionEntity(doc: SessionLeanDocument): ICashRegisterSession {
  return {
    id: doc._id,
    restaurantId: doc.restaurantId,
    openedAt: doc.openedAt.toISOString(),
    closedAt: doc.closedAt?.toISOString(),
    openingBalance: doc.openingBalance,
    closingBalance: doc.closingBalance,
    status: doc.status,
    openedBy: doc.openedBy,
    closedBy: doc.closedBy,
  };
}

function toMovementEntity(doc: MovementLeanDocument): ICashMovementEntry {
  return {
    id: doc._id,
    cashRegisterSessionId: doc.cashRegisterSessionId,
    type: doc.type,
    amount: doc.amount,
    description: doc.description,
    orderId: doc.orderId,
    createdAt: doc.createdAt.toISOString(),
  };
}

export class CashRegisterMongooseRepository implements ICashRegisterRepository {
  async findOpenSessionByRestaurant(restaurantId: string): Promise<ICashRegisterSession | null> {
    const doc = await CashRegisterSessionModel.findOne({ restaurantId, status: 'aberto' }).lean<SessionLeanDocument>();
    return doc ? toSessionEntity(doc) : null;
  }

  async findById(id: string): Promise<ICashRegisterSession | null> {
    const doc = await CashRegisterSessionModel.findById(id).lean<SessionLeanDocument>();
    return doc ? toSessionEntity(doc) : null;
  }

  async open(restaurantId: string, openingBalance: number, openedBy?: string): Promise<ICashRegisterSession> {
    const doc = await CashRegisterSessionModel.create({
      restaurantId,
      openedAt: new Date(),
      openingBalance,
      status: 'aberto',
      openedBy,
    });
    return toSessionEntity(doc.toObject() as SessionLeanDocument);
  }

  async addMovement(sessionId: string, input: NewCashMovementInput): Promise<ICashMovementEntry> {
    const doc = await CashMovementEntryModel.create({
      cashRegisterSessionId: sessionId,
      type: input.type,
      amount: input.amount,
      description: input.description,
      orderId: input.orderId,
    });
    return toMovementEntity(doc.toObject() as MovementLeanDocument);
  }

  async listMovements(sessionId: string): Promise<ICashMovementEntry[]> {
    const docs = await CashMovementEntryModel.find({ cashRegisterSessionId: sessionId })
      .sort({ createdAt: 1 })
      .lean<MovementLeanDocument[]>();
    return docs.map(toMovementEntity);
  }

  /** REQ-7 — abertura + entradas − saídas, sempre recalculado (nunca persistido). */
  async getCalculatedBalance(sessionId: string): Promise<number> {
    const session = await CashRegisterSessionModel.findById(sessionId).lean<SessionLeanDocument>();
    if (!session) return 0;
    const movements = await this.listMovements(sessionId);
    return movements.reduce(
      (balance, movement) => balance + (movement.type === 'entrada' ? movement.amount : -movement.amount),
      session.openingBalance,
    );
  }

  async close(sessionId: string, countedValue: number, closedBy?: string): Promise<CloseCashRegisterResult> {
    const calculatedBalance = await this.getCalculatedBalance(sessionId);
    const doc = await CashRegisterSessionModel.findByIdAndUpdate(
      sessionId,
      { $set: { status: 'fechado', closedAt: new Date(), closingBalance: countedValue, closedBy } },
      { new: true },
    ).lean<SessionLeanDocument>();
    return {
      session: toSessionEntity(doc as SessionLeanDocument),
      calculatedBalance,
      difference: countedValue - calculatedBalance,
    };
  }
}
