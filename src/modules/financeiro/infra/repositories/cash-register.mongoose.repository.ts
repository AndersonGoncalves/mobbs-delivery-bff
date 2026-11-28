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
import { ConflictError } from 'restify-errors';
import { cashRegisterDate, cashRegisterDayBounds } from '../../domain/cash-register-date';

interface SessionLeanDocument {
  movementVersion?: number;
  movementWrites?: number;
  businessDate?: string;
  accountingEndAt?: Date;
  _id: string;
  restaurantId: string;
  openedAt: Date;
  closedAt?: Date;
  openingBalance: number;
  closingBalance?: number;
  status: CashRegisterStatus;
  openedBy?: string;
  closedBy?: string;
  openedAutomatically?: boolean;
  closedAutomatically?: boolean;
  reopenedBy?: string;
  reopenedAt?: Date;
}

interface MovementLeanDocument {
  _id: string;
  cashRegisterSessionId: string;
  type: CashMovementType;
  amount: number;
  description: string;
  orderId?: string;
  paymentMethod?: string;
  paymentId?: string;
  createdAt: Date;
}

function toSessionEntity(doc: SessionLeanDocument): ICashRegisterSession {
  return {
    businessDate: doc.businessDate,
    accountingEndAt: doc.accountingEndAt?.toISOString(),
    id: doc._id,
    restaurantId: doc.restaurantId,
    openedAt: doc.openedAt.toISOString(),
    closedAt: doc.closedAt?.toISOString(),
    openingBalance: doc.openingBalance,
    closingBalance: doc.closingBalance,
    status: doc.status,
    openedBy: doc.openedBy,
    closedBy: doc.closedBy,
    openedAutomatically: doc.openedAutomatically,
    closedAutomatically: doc.closedAutomatically,
    reopenedBy: doc.reopenedBy,
    reopenedAt: doc.reopenedAt?.toISOString(),
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
    paymentMethod: doc.paymentMethod,
    paymentId: doc.paymentId,
    createdAt: doc.createdAt.toISOString(),
  };
}

/**
 * `_id` determinístico dos movimentos automáticos — trava de duplicidade no índice único (dois avisos do
 * mesmo pagamento chegando juntos gravam uma entrada só; ver `createMovementDoc`).
 *
 * specs/0213 T011 (achado na homologação, 28/11/2026) — antes, TODO movimento com `orderId` usava
 * `sale:<sessão>:<pagamento ou pedido>`, inclusive o estorno: o estorno de um pedido cuja venda estava
 * na mesma sessão gerava o MESMO `_id`, e `createMovementDoc` devolvia a entrada existente em silêncio
 * — o estorno nunca era gravado. Agora:
 * - venda (`entrada`): `sale:<sessão>:<pagamento ou pedido>` (como antes);
 * - estorno do pedido inteiro (`saida` sem `paymentId`): `reversal:<sessão>:<pedido>` — uma vez por pedido;
 * - troco a devolver de mesa (`saida` com `paymentId`, specs/0214): sem `_id` fixo — pode acontecer mais
 *   de uma vez no mesmo pagamento, quem chama garante que não repete.
 */
function automaticMovementId(sessionId: string, input: NewCashMovementInput): string | undefined {
  if (!input.orderId) return undefined;
  if (input.type === 'entrada') return `sale:${sessionId}:${input.paymentId ?? input.orderId}`;
  if (input.paymentId) return undefined;
  return `reversal:${sessionId}:${input.orderId}`;
}

export class CashRegisterMongooseRepository implements ICashRegisterRepository {
  /** Caixa aberto na data civil atual, nunca um caixa pendente de outra data (esse caso é
   * `findPendingSessions`, de propósito: uma sessão presa de um dia anterior precisa do aviso
   * explícito de "feche-o antes", não ser tratada como "a sessão de hoje" transparentemente). */
  async findOpenSessionByRestaurant(restaurantId: string): Promise<ICashRegisterSession | null> {
    const date = cashRegisterDate();
    const { from, to } = cashRegisterDayBounds(date);
    // specs/0219-multiplas-sessoes-caixa-por-dia — filtra `status: 'aberto'` NA QUERY (não mais
    // delegando pra `findSessionByDate` e checando o status depois em JS): com múltiplas sessões
    // no mesmo dia, aquele método (`findOne` sem `sort`) podia devolver uma sessão FECHADA de hoje
    // mesmo havendo uma aberta também hoje, fazendo esta função devolver `null` por engano.
    const doc = await CashRegisterSessionModel.findOne({
      restaurantId,
      status: 'aberto',
      $or: [{ businessDate: date }, { businessDate: { $exists: false }, openedAt: { $gte: from, $lt: to } }],
    }).lean<SessionLeanDocument>();
    return doc ? toSessionEntity(doc) : null;
  }

  async findSessionByDate(restaurantId: string, date: string): Promise<ICashRegisterSession | null> {
    const { from, to } = cashRegisterDayBounds(date);
    const doc = await CashRegisterSessionModel.findOne({
      restaurantId,
      $or: [{ businessDate: date }, { businessDate: { $exists: false }, openedAt: { $gte: from, $lt: to } }],
    }).lean<SessionLeanDocument>();
    return doc ? toSessionEntity(doc) : null;
  }

  async findClosedSessionsForDate(restaurantId: string, date: string): Promise<ICashRegisterSession[]> {
    const { from, to } = cashRegisterDayBounds(date);
    const docs = await CashRegisterSessionModel.find({
      restaurantId,
      status: 'fechado',
      $or: [{ businessDate: date }, { businessDate: { $exists: false }, openedAt: { $gte: from, $lt: to } }],
    })
      .sort({ closedAt: 1 })
      .lean<SessionLeanDocument[]>();
    return docs.map(toSessionEntity);
  }

  async findPendingSessions(restaurantId: string): Promise<ICashRegisterSession[]> {
    const docs = await CashRegisterSessionModel.find({ restaurantId, status: 'aberto' })
      .sort({ openedAt: 1 }).lean<SessionLeanDocument[]>();
    return docs.map(toSessionEntity);
  }

  async findById(id: string): Promise<ICashRegisterSession | null> {
    const doc = await CashRegisterSessionModel.findById(id).lean<SessionLeanDocument>();
    return doc ? toSessionEntity(doc) : null;
  }

  async open(
    restaurantId: string,
    openingBalance: number,
    openedBy?: string,
    openedAutomatically?: boolean,
    now: Date = new Date(),
  ): Promise<ICashRegisterSession> {
    const businessDate = cashRegisterDate(now);
    // specs/0219-multiplas-sessoes-caixa-por-dia — deixou de checar "existe sessão desta data"
    // (podia ser uma já FECHADA, bloqueando abrir uma nova no mesmo dia sem necessidade); a única
    // invariante real é "nunca duas sessões abertas ao mesmo tempo", já coberta abaixo e reforçada
    // pelo índice único parcial do schema.
    const stuckOpenSession = (await this.findPendingSessions(restaurantId))[0];
    if (stuckOpenSession) {
      throw new ConflictError(
        `Existe um caixa aberto (id ${stuckOpenSession.id}) desde ${stuckOpenSession.businessDate ?? cashRegisterDate(new Date(stuckOpenSession.openedAt))} — feche-o antes de abrir um novo.`,
      );
    }
    try {
      // `_id` não é mais fixado aqui (não é mais `daily:<restaurantId>:<businessDate>`) — o
      // schema gera um identificador próprio (`randomUUID()`), já que uma mesma `businessDate`
      // pode ter mais de uma sessão agora.
      const doc = await CashRegisterSessionModel.create({
        restaurantId,
        businessDate,
        openedAt: now,
        openingBalance,
        status: 'aberto',
        openedBy,
        openedAutomatically,
      });
      return toSessionEntity(doc.toObject() as SessionLeanDocument);
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new ConflictError('Já existe um caixa aberto para este restaurante');
      throw error;
    }
  }

  async addMovement(sessionId: string, input: NewCashMovementInput): Promise<ICashMovementEntry> {
    const id = automaticMovementId(sessionId, input);
    const reserved = await CashRegisterSessionModel.findOneAndUpdate(
      { _id: sessionId, status: 'aberto' },
      { $inc: { movementVersion: 1, movementWrites: 1 } },
    ).lean<SessionLeanDocument>();

    if (!reserved) {
      // Achado real (10/11/2026) — venda automática (`orderId` presente) chegando numa sessão já
      // FECHADA (caso 2 de `addAutomaticEntry`, lançamento tardio documentado lá) sempre caía
      // aqui e lançava `ConflictError`, descartado em silêncio pelo `try/catch` do
      // `OrdersController` — o lançamento nunca era criado, mesmo a camada de serviço
      // explicitamente pretendendo permitir isso. A trava `status: 'aberto'` acima protege contra
      // correr com `close()` (que exige `movementWrites: 0`) — mas essa corrida só existe enquanto
      // a sessão está aberta; uma sessão já fechada não tem mais `close()` pra correr contra, então
      // pode gravar direto, sem a reserva de `movementVersion`/`movementWrites`. Lançamento MANUAL
      // (sem `orderId`) continua bloqueado — `CashRegisterController` já recusa antes de chegar
      // aqui, e esta trava é a defesa de verdade, igual sempre foi.
      if (!input.orderId) throw new ConflictError('Sessão de caixa já está fechada');
      const closedSession = await CashRegisterSessionModel.findOne({ _id: sessionId, status: 'fechado' }).lean<SessionLeanDocument>();
      if (!closedSession) throw new ConflictError('Sessão de caixa já está fechada');
      return this.createMovementDoc(sessionId, input, id);
    }

    try {
      return await this.createMovementDoc(sessionId, input, id);
    } finally {
      await CashRegisterSessionModel.updateOne({ _id: sessionId }, { $inc: { movementWrites: -1 } });
    }
  }

  private async createMovementDoc(sessionId: string, input: NewCashMovementInput, id?: string): Promise<ICashMovementEntry> {
    try {
      const doc = await CashMovementEntryModel.create({
        ...(id ? { _id: id } : {}),
        cashRegisterSessionId: sessionId,
        type: input.type,
        amount: input.amount,
        description: input.description,
        orderId: input.orderId,
        paymentMethod: input.paymentMethod,
        paymentId: input.paymentId,
      });
      return toMovementEntity(doc.toObject() as MovementLeanDocument);
    } catch (error) {
      if (id && (error as { code?: number }).code === 11000) {
        const existing = await CashMovementEntryModel.findById(id).lean<MovementLeanDocument>();
        if (existing) return toMovementEntity(existing);
      }
      throw error;
    }
  }

  async listMovements(sessionId: string): Promise<ICashMovementEntry[]> {
    const docs = await CashMovementEntryModel.find({ cashRegisterSessionId: sessionId })
      .sort({ createdAt: 1 })
      .lean<MovementLeanDocument[]>();
    return docs.map(toMovementEntity);
  }

  /**
   * REQ-7 — abertura + entradas − saídas, sempre recalculado (nunca persistido).
   *
   * Pedido explícito do usuário (follow-up, achado real 06/11/2026) — sessão fechada exclui
   * lançamento com `createdAt` depois de `closedAt` (venda automática tardia, ver cabeçalho de
   * `addAutomaticEntry` em `cash-register.service.ts`): sem isso, abrir o histórico de um
   * fechamento já conferido mudaria o "Saldo calculado"/"Diferença" sozinho, bem depois da
   * conferência física já ter acontecido. `getClosingSummary` expõe esses lançamentos à parte
   * (`lateMovements`), nunca escondidos — só fora da conta já fechada. Sessão aberta (sem
   * `closedAt`) soma tudo normalmente, nada pode ser "tardio" antes do fechamento existir.
   */
  async getCalculatedBalance(sessionId: string): Promise<number> {
    const session = await CashRegisterSessionModel.findById(sessionId).lean<SessionLeanDocument>();
    if (!session) return 0;
    const movements = await this.listMovements(sessionId);
    const reconciled = session.closedAt
      ? movements.filter((movement) => new Date(movement.createdAt) <= new Date(session.closedAt!))
      : movements;
    return reconciled.reduce(
      (balance, movement) => balance + (movement.type === 'entrada' ? movement.amount : -movement.amount),
      session.openingBalance,
    );
  }

  async close(
    sessionId: string,
    countedValue: number,
    closedBy?: string,
    closedAutomatically = false,
  ): Promise<CloseCashRegisterResult> {
    const snapshot = await CashRegisterSessionModel.findById(sessionId).lean<SessionLeanDocument>();
    if (!snapshot || snapshot.status !== 'aberto' || snapshot.movementWrites) {
      throw new ConflictError('Caixa fechado ou recebendo lançamentos. Atualize e confira novamente');
    }
    const calculatedBalance = await this.getCalculatedBalance(sessionId);
    // Pedido explícito do usuário (follow-up) — `accountingEndAt` passa a ser sempre o instante
    // real do fechamento, nunca mais recalculado/travado na meia-noite (ver cabeçalho de
    // `cashRegisterPeriodEnd`); por isso usa o mesmo `now` de `closedAt`, não chama mais aquela
    // função aqui — ela já devolveria o mesmo valor (`closedAt` ainda não setado no snapshot).
    const now = new Date();
    const doc = await CashRegisterSessionModel.findOneAndUpdate(
      {
        _id: sessionId, status: 'aberto',
        movementVersion: snapshot.movementVersion === undefined ? { $exists: false } : snapshot.movementVersion,
        movementWrites: snapshot.movementWrites === undefined ? { $exists: false } : 0,
      },
      // Achado real de produção (21/11/2026) — este `$set` ignorava o parâmetro recebido e
      // gravava `closedAutomatically: false` sempre, não importa quem chamou; todo o histórico
      // mostrava fechamento manual mesmo quando era o worker automático que fechou.
      { $set: { status: 'fechado', closedAt: now, accountingEndAt: now, closingBalance: countedValue, closedBy, closedAutomatically } },
      { new: true },
    ).lean<SessionLeanDocument>();
    if (!doc) throw new ConflictError('O caixa foi fechado ou recebeu novos lançamentos. Atualize e confira novamente');
    return {
      session: toSessionEntity(doc as SessionLeanDocument),
      calculatedBalance,
      difference: countedValue - calculatedBalance,
    };
  }

  /** Ajuste explícito do usuário (02/11/2026) — reabre um caixa `fechado`: volta `status:
   * 'aberto'`, limpa `closedAt`/`closingBalance`/`closedAutomatically` (a próxima conferência os
   * redefine) e registra `reopenedBy`/`reopenedAt`. Filtro atômico `status: 'fechado'` evita
   * reabrir duas vezes em paralelo.
   *
   * Pedido explícito do usuário (follow-up, achado real 06/11/2026) — `accountingEndAt` precisa
   * sair junto: sem isso, `cashRegisterPeriodEnd` (`cash-register-date.ts`) via o valor antigo
   * primeiro e tratava o caixa reaberto como já tendo um teto fixo, voltando a travar o período
   * mesmo com a sessão `aberto` de novo — exatamente o caminho que o dono usaria pra recuperar uma
   * venda que ficou de fora por ter sido fechado cedo demais (reabrir, deixar `syncOpenSession`
   * resgatar o pedido, fechar de novo). */
  async reopen(sessionId: string, reopenedBy?: string, now: Date = new Date()): Promise<ICashRegisterSession> {
    const doc = await CashRegisterSessionModel.findOneAndUpdate(
      { _id: sessionId, status: 'fechado' },
      {
        $set: { status: 'aberto', reopenedBy, reopenedAt: now },
        $unset: { closedAt: '', closingBalance: '', closedAutomatically: '', accountingEndAt: '' },
      },
      { new: true },
    ).lean<SessionLeanDocument>();
    if (!doc) throw new ConflictError('O caixa não está fechado — atualize e confira novamente');
    return toSessionEntity(doc);
  }

  /** specs/0118-controle-caixa-automatico-redes-sociais REQ-10. */
  async findLatestClosedSession(restaurantId: string): Promise<ICashRegisterSession | null> {
    const doc = await CashRegisterSessionModel.findOne({ restaurantId, status: 'fechado' })
      .sort({ closedAt: -1 }).lean<SessionLeanDocument>();
    return doc ? toSessionEntity(doc) : null;
  }

  async findClosedSessionsBetween(restaurantId: string, from: Date, to: Date): Promise<ICashRegisterSession[]> {
    const docs = await CashRegisterSessionModel.find({
      restaurantId,
      status: 'fechado',
      closedAt: { $gte: from, $lte: to },
    })
      .sort({ closedAt: 1 })
      .lean<SessionLeanDocument[]>();
    return docs.map(toSessionEntity);
  }

  /** specs/0118-controle-caixa-automatico-redes-sociais REQ-11 — resolve as sessões do
   * restaurante primeiro (`CashMovementEntry` não tem `restaurantId` próprio, só
   * `cashRegisterSessionId`), depois filtra os movimentos manuais (`orderId` ausente) no período. */
  async findMovementsByRestaurantBetween(restaurantId: string, from: Date, to: Date): Promise<ICashMovementEntry[]> {
    const sessions = await CashRegisterSessionModel.find({ restaurantId }, { _id: 1 }).lean<{ _id: string }[]>();
    const sessionIds = sessions.map((session) => session._id);
    if (sessionIds.length === 0) return [];

    const docs = await CashMovementEntryModel.find({
      cashRegisterSessionId: { $in: sessionIds },
      createdAt: { $gte: from, $lte: to },
    })
      .sort({ createdAt: 1 })
      .lean<MovementLeanDocument[]>();
    return docs.map(toMovementEntity);
  }
}
