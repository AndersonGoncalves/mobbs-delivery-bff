import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';

const pixAvailabilityExceptionSchema = new Schema(
  {
    _id: { type: String, default: () => randomUUID() },
    obligationId: { type: String, required: true },
    firstValidPixAvailableAt: { type: Date, required: true },
    graceDeadline: { type: Date, required: true },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);

// Um registro por obligation, criado uma única vez (`createIfAbsent`, AC-5 "não renova a janela").
pixAvailabilityExceptionSchema.index({ obligationId: 1 }, { unique: true });

export const PixAvailabilityExceptionModel = model('PixAvailabilityException', pixAvailabilityExceptionSchema, 'pixAvailabilityException');
