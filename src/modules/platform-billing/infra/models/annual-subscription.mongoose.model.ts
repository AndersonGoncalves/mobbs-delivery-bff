import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const annualSubscriptionSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    restaurantId: { type: String, required: true },
    joinedAt: { type: Date, required: true },
    renewalActive: { type: Boolean, required: true, default: true },
    cancelledAt: { type: Date },
    cancelledBy: { type: String },
  },
  { _id: false, timestamps: true },
);

// Nunca mais de uma assinatura ATIVA por restaurante (REQ-13 "impedir adesões simultâneas
// duplicadas") — garantido por índice, não por lock em memória (plan.md §2). Histórico de
// assinaturas já canceladas não entra nesta restrição (`partialFilterExpression`).
annualSubscriptionSchema.index({ restaurantId: 1 }, { unique: true, partialFilterExpression: { renewalActive: true } });

export const AnnualSubscriptionModel = model('AnnualSubscription', annualSubscriptionSchema, 'annualSubscription');
