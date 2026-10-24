import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';
import { Suggestion, suggestionStatuses } from '../domain/suggestion';

export interface SuggestionDocument extends Omit<Suggestion, 'id' | 'unread'> {
  _id: string;
}

const updateSchema = new Schema({
  status: { type: String, enum: suggestionStatuses, required: true },
  reply: { type: String, required: false, default: '' },
  createdAt: { type: Date, required: true },
}, { _id: false });

const schema = new Schema<SuggestionDocument>({
  _id: { type: String, default: () => randomUUID() },
  restaurantId: { type: String, required: true },
  restaurantName: { type: String, required: true },
  authorEmail: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  status: { type: String, enum: suggestionStatuses, required: true, default: 'received' },
  revision: { type: Number, required: true, default: 0 },
  updates: { type: [updateSchema], default: [] },
}, { timestamps: true, _id: false });

schema.index({ restaurantId: 1, createdAt: -1, _id: -1 });
schema.index({ status: 1, createdAt: -1, _id: -1 });
schema.index({ createdAt: -1, _id: -1 });

export const SuggestionModel = model<SuggestionDocument>('Suggestion', schema, 'suggestion');

const readSchema = new Schema({
  suggestionId: { type: String, required: true },
  operatorId: { type: String, required: true },
  revision: { type: Number, required: true },
}, { timestamps: true });
readSchema.index({ suggestionId: 1, operatorId: 1 }, { unique: true });

export const SuggestionReadModel = model('SuggestionRead', readSchema, 'suggestion_read');
