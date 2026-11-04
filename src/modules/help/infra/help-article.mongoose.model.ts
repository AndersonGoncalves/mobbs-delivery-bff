import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';
import { helpAudiences, type HelpArticle } from '../domain/help-article';

const stepSchema = new Schema(
  { text: { type: String, required: true }, imageUrl: { type: String, default: '' } },
  { _id: false },
);

export interface HelpArticleDocument extends Omit<HelpArticle, 'id'> {
  _id: string;
}

const helpArticleSchema = new Schema<HelpArticleDocument>(
  {
    _id: { type: String, default: () => randomUUID() },
    audience: { type: String, enum: helpAudiences, required: true },
    moduleKey: { type: String, required: true },
    moduleLabel: { type: String, required: true },
    moduleOrder: { type: Number, required: true },
    itemLabel: { type: String, required: true },
    itemOrder: { type: Number, required: true },
    linkTo: { type: String, required: true },
    title: { type: String, required: true },
    steps: { type: [stepSchema], default: [] },
  },
  { _id: false, timestamps: true },
);
helpArticleSchema.index({ audience: 1, moduleOrder: 1, itemOrder: 1 });

export const HelpArticleModel = model('HelpArticle', helpArticleSchema, 'helpArticle');
