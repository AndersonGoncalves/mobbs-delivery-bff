import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const resellerCommissionSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    resellerId: { type: String, required: true },
    restaurantId: { type: String, required: true },
    // specs/0205-comissao-revendedor plan.md — nunca mais de uma comissão por obligation
    // (idempotência REQ-7, reforçada no banco, mesmo mecanismo de `ResellerClient.restaurantId`).
    subscriptionObligationId: { type: String, required: true, unique: true },
    obligationKind: { type: String, enum: ['monthly', 'monthly-prorated', 'annual-initial', 'annual-renewal'], required: true },
    obligationAmountCents: { type: Number, required: true },
    commissionCents: { type: Number, required: true },
    status: { type: String, enum: ['pendente', 'pago', 'cancelada'], default: 'pendente' },
    createdAt: { type: Date, default: () => new Date() },
    paidAt: { type: Date, required: false },
    cancelledAt: { type: Date, required: false },
    obligationRefundedAt: { type: Date, required: false },
  },
  { _id: false },
);

resellerCommissionSchema.index({ resellerId: 1 });
resellerCommissionSchema.index({ restaurantId: 1, obligationKind: 1 });

export const ResellerCommissionModel = model('ResellerCommission', resellerCommissionSchema, 'reseller_commissions');
