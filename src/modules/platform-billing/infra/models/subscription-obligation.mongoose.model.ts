import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const coveragePeriodSchema = new Schema({ start: { type: Date, required: true }, end: { type: Date, required: true } }, { _id: false });
const roundingDetailSchema = new Schema({ daysUnderMonthly: { type: Number, required: true }, daysInMonth: { type: Number, required: true } }, { _id: false });

const subscriptionObligationSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    kind: { type: String, enum: ['monthly', 'monthly-prorated', 'annual-initial', 'annual-renewal'], required: true },
    referenceMonth: { type: String },
    coveragePeriod: { type: coveragePeriodSchema },
    tier: { type: String, enum: ['free', 'pro', 'premium'], required: true },
    settingsVersionId: { type: String, required: true },
    revenueCentsUsed: { type: Number },
    amountCents: { type: Number, required: true },
    roundingDetail: { type: roundingDetailSchema },
    status: {
      type: String,
      enum: ['exempt', 'awaiting_issue', 'issue_failed', 'pending', 'paid', 'overdue', 'cancelled', 'refunded', 'partially_refunded'],
      required: true,
    },
    dueDate: { type: Date, required: true },
    issuedAt: { type: Date },
    paidAt: { type: Date },
    issueFailureReason: { type: String },
    asaasChargeId: { type: String },
    pixPayload: { type: String },
    pixExpiresAt: { type: Date },
  },
  { _id: false, timestamps: true },
);

// Unicidade de obligation mensal (plan.md §2) — só se aplica a documentos que TÊM
// `referenceMonth` (mensal/proporcional); `partialFilterExpression` evita colidir com obligations
// anuais, que nunca têm esse campo.
subscriptionObligationSchema.index(
  { restaurantId: 1, kind: 1, referenceMonth: 1 },
  { unique: true, partialFilterExpression: { referenceMonth: { $exists: true } } },
);
// Unicidade de obligation anual — mesmo raciocínio, pelo início da cobertura.
subscriptionObligationSchema.index(
  { restaurantId: 1, kind: 1, 'coveragePeriod.start': 1 },
  { unique: true, partialFilterExpression: { 'coveragePeriod.start': { $exists: true } } },
);
subscriptionObligationSchema.index({ status: 1 });
subscriptionObligationSchema.index({ restaurantId: 1, createdAt: -1 });

export const SubscriptionObligationModel = model('SubscriptionObligation', subscriptionObligationSchema, 'subscriptionObligation');
