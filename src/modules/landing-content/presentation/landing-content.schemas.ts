import { z } from 'zod';
import { extractYoutubeId, testimonialStatuses } from '../domain/landing-content';

const httpsUrl = z.string().trim().max(2048).url('Informe uma URL válida').refine((url) => url.startsWith('https://'), 'A URL deve começar com https://');
const optionalHttpsUrl = z.union([z.literal(''), httpsUrl]).default('');
const optionalColor = z.union([z.literal(''), z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida')]).default('');
const sectionTitle = z.string().trim().max(120).default('');
const itemId = z.string().trim().min(1).max(64).optional();

const featureSchema = z.object({
  id: itemId,
  text: z.string().trim().min(1, 'Informe o texto da funcionalidade').max(200),
}).strict();

const howItWorksSchema = z.object({
  id: itemId,
  title: z.string().trim().min(1, 'Informe o título').max(120),
  description: z.string().trim().max(1000).default(''),
  mediaType: z.enum(['youtube', 'image']),
  mediaUrl: z.string().trim().min(1, 'Informe o vídeo ou a imagem').max(2048),
}).strict().superRefine((item, ctx) => {
  if (item.mediaType === 'youtube' && !extractYoutubeId(item.mediaUrl)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mediaUrl'], message: 'Informe um link válido do YouTube' });
  }
  if (item.mediaType === 'image' && !httpsUrl.safeParse(item.mediaUrl).success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mediaUrl'], message: 'Imagem inválida' });
  }
});

const clientSchema = z.object({
  id: itemId,
  companyName: z.string().trim().min(1, 'Informe o nome da empresa').max(120),
  description: z.string().trim().max(500).default(''),
  imageUrl: optionalHttpsUrl,
  // Pedido explícito do usuário — link da loja desse cliente.
  linkUrl: optionalHttpsUrl,
}).strict();

const sectionVisible = z.boolean().default(true);

const companySchema = z.object({
  legalName: z.string().trim().max(160).default(''),
  cnpj: z.string().trim().max(32).default(''),
  address: z.string().trim().max(300).default(''),
  phone: z.string().trim().max(32).default(''),
  email: z.union([z.literal(''), z.string().trim().max(254).email('E-mail inválido')]).default(''),
  instagramUrl: optionalHttpsUrl,
  termsUrl: optionalHttpsUrl,
  privacyUrl: optionalHttpsUrl,
  backgroundColor: optionalColor,
  // Pedido explícito do usuário — liga/desliga a seção (rodapé) na home.
  visible: sectionVisible,
}).strict();

const sectionSettingsSchema = z.object({
  title: sectionTitle,
  backgroundColor: optionalColor,
  backgroundImageUrl: optionalHttpsUrl,
  visible: sectionVisible,
}).strict();

const settingsSchema = z.object({
  headerColor: optionalColor,
  features: sectionSettingsSchema,
  howItWorks: z.object({ title: sectionTitle, backgroundColor: optionalColor, visible: sectionVisible }).strict(),
  clients: sectionSettingsSchema.extend({ cardColor: optionalColor, textColor: optionalColor }).strict(),
  testimonials: sectionSettingsSchema,
}).strict();

export const landingContentSchema = z.object({
  features: z.array(featureSchema).max(50),
  howItWorks: z.array(howItWorksSchema).max(20),
  clients: z.array(clientSchema).max(60),
  company: companySchema,
  // Cliente antigo que não envia `settings` mantém o que já estava salvo.
  settings: settingsSchema.optional(),
}).strict();

export const submitTestimonialSchema = z.object({
  authorName: z.string().trim().min(2, 'Informe seu nome').max(80),
  businessName: z.string().trim().min(2, 'Informe o nome do seu restaurante').max(80),
  city: z.string().trim().max(80).default(''),
  text: z.string().trim().min(10, 'Escreva um depoimento com ao menos 10 caracteres').max(600),
  rating: z.number().int().min(1).max(5).optional(),
  // Honeypot: campo oculto no formulário, só robôs o preenchem.
  website: z.string().max(200).optional(),
}).strict();

export const listTestimonialsSchema = z.object({ status: z.enum(testimonialStatuses).optional() });
export const updateTestimonialSchema = z.object({ status: z.enum(testimonialStatuses) }).strict();
export const testimonialIdSchema = z.string().trim().min(1).max(64);
export const presignLandingUploadSchema = z.object({ filename: z.string().min(1) });
