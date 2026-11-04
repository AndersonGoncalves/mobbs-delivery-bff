import { randomUUID } from 'crypto';
import { Schema, model } from 'mongoose';
import { testimonialStatuses, type LandingContent, type LandingTestimonial } from '../domain/landing-content';

export const LANDING_CONTENT_SINGLETON_ID = 'singleton';

const featureSchema = new Schema(
  { id: { type: String, required: true }, text: { type: String, required: true }, group: { type: String, default: '' } },
  { _id: false },
);
const featureGroupSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    backgroundColor: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
  },
  { _id: false },
);
const faqItemSchema = new Schema(
  { id: { type: String, required: true }, question: { type: String, required: true }, answer: { type: String, required: true } },
  { _id: false },
);
const pricingPlanSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    billingTier: { type: String, enum: ['free', 'pro', 'premium', 'custom'], default: 'custom' },
    monthlyPriceCents: { type: Number, required: true },
    annualMonthlyPriceCents: { type: Number, required: true },
    highlighted: { type: Boolean, default: false },
    features: { type: [String], default: [] },
  },
  { _id: false },
);
const promoBlockButtonSchema = new Schema(
  { label: { type: String, required: true }, url: { type: String, required: true }, icon: { type: String, enum: ['whatsapp', 'phone', 'none'], default: 'none' } },
  { _id: false },
);
const promoBlockSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    imagePosition: { type: String, enum: ['left', 'right'], default: 'right' },
    backgroundColor: { type: String, default: '' },
    buttons: { type: [promoBlockButtonSchema], default: [] },
  },
  { _id: false },
);
const howItWorksSchema = new Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  mediaType: { type: String, enum: ['youtube', 'image'], required: true },
  mediaUrl: { type: String, required: true },
}, { _id: false });
const clientSchema = new Schema({
  id: { type: String, required: true },
  companyName: { type: String, required: true },
  description: { type: String, default: '' },
  imageUrl: { type: String, default: '' },
  linkUrl: { type: String, default: '' },
}, { _id: false });
const companySchema = new Schema({
  legalName: { type: String, default: '' },
  cnpj: { type: String, default: '' },
  address: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  instagramUrl: { type: String, default: '' },
  termsUrl: { type: String, default: '' },
  privacyUrl: { type: String, default: '' },
  backgroundColor: { type: String, default: '' },
  visible: { type: Boolean, default: true },
}, { _id: false });

const sectionSettingsFields = {
  title: { type: String, default: '' },
  backgroundColor: { type: String, default: '' },
  backgroundImageUrl: { type: String, default: '' },
  visible: { type: Boolean, default: true },
};
const settingsSchema = new Schema({
  headerColor: { type: String, default: '' },
  features: {
    type: new Schema({ ...sectionSettingsFields, cardColor: { type: String, default: '' } }, { _id: false }),
    default: () => ({}),
  },
  howItWorks: {
    type: new Schema({ title: { type: String, default: '' }, backgroundColor: { type: String, default: '' }, visible: { type: Boolean, default: true } }, { _id: false }),
    default: () => ({}),
  },
  clients: {
    type: new Schema({ ...sectionSettingsFields, cardColor: { type: String, default: '' }, textColor: { type: String, default: '' } }, { _id: false }),
    default: () => ({}),
  },
  testimonials: { type: new Schema(sectionSettingsFields, { _id: false }), default: () => ({}) },
  faq: { type: new Schema(sectionSettingsFields, { _id: false }), default: () => ({}) },
  pricing: {
    type: new Schema({ ...sectionSettingsFields, cardColor: { type: String, default: '' } }, { _id: false }),
    default: () => ({}),
  },
}, { _id: false });

const landingContentSchema = new Schema<LandingContent & { _id: string }>(
  {
    _id: { type: String },
    features: { type: [featureSchema], default: [] },
    featureGroups: { type: [featureGroupSchema], default: [] },
    promoBlocks: { type: [promoBlockSchema], default: [] },
    howItWorks: { type: [howItWorksSchema], default: [] },
    clients: { type: [clientSchema], default: [] },
    faq: { type: [faqItemSchema], default: [] },
    pricingPlans: { type: [pricingPlanSchema], default: [] },
    company: { type: companySchema, default: () => ({}) },
    settings: { type: settingsSchema, default: () => ({}) },
  },
  { _id: false, timestamps: true },
);

export const LandingContentModel = model('LandingContent', landingContentSchema, 'landingContent');

export interface LandingTestimonialDocument extends Omit<LandingTestimonial, 'id'> {
  _id: string;
}

const testimonialSchema = new Schema<LandingTestimonialDocument>(
  {
    _id: { type: String, default: () => randomUUID() },
    authorName: { type: String, required: true },
    businessName: { type: String, required: true },
    city: { type: String, default: '' },
    text: { type: String, required: true },
    rating: { type: Number, min: 1, max: 5 },
    status: { type: String, enum: testimonialStatuses, required: true, default: 'pending' },
  },
  { _id: false, timestamps: { createdAt: true, updatedAt: false } },
);
testimonialSchema.index({ status: 1, createdAt: -1 });

export const LandingTestimonialModel = model('LandingTestimonial', testimonialSchema, 'landingTestimonials');
