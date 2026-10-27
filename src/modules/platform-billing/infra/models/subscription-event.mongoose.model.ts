import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const subscriptionEventSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    obligationId: { type: String, required: true },
    type: {
      type: String,
      enum: ['issued', 'issue_failed', 'webhook_received', 'reconciled', 'refunded', 'partially_refunded', 'expired', 'manual_exception', 'reprocessed'],
      required: true,
    },
    payload: { type: Schema.Types.Mixed },
    asaasEventId: { type: String },
    actor: { type: String, required: true },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);

// Dedupe de webhook (REQ-20/AC-15) — só quando o payload trouxer um id de evento do Asaas.
subscriptionEventSchema.index(
  { obligationId: 1, asaasEventId: 1 },
  { unique: true, partialFilterExpression: { asaasEventId: { $exists: true } } },
);
subscriptionEventSchema.index({ obligationId: 1, createdAt: -1 });

export const SubscriptionEventModel = model('SubscriptionEvent', subscriptionEventSchema, 'subscriptionEvent');
