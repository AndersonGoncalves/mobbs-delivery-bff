/** specs/0183-conteudo-pagina-inicial — conteúdo da página inicial pública, editado pelo administrador da plataforma. */
export interface LandingFeature {
  id: string;
  text: string;
  /**
   * Pedido explícito do usuário — agrupa funcionalidades relacionadas na home (ex. "Pagamento",
   * "Fidelização e marketing"), casando por nome com `LandingFeatureGroup.name`. Obrigatório —
   * toda funcionalidade precisa pertencer a um card do carrossel. Não depende de adjacência no
   * array — o agrupamento é por nome, os itens de um grupo podem estar em qualquer posição.
   */
  group: string;
}

/**
 * Pedido explícito do usuário — cadastro próprio de cada grupo de funcionalidades (card do
 * carrossel na home): nome (casa com `LandingFeature.group`), cor de dentro do card e imagem de
 * topo opcional (vazia = mostra só nome do grupo + itens, sem imagem). A ordem do array é a ordem
 * dos cards no carrossel.
 */
export interface LandingFeatureGroup {
  id: string;
  name: string;
  backgroundColor: string;
  imageUrl: string;
}

/** Pedido explícito do usuário — seção "Perguntas Frequentes" (pergunta/resposta em acordeão na home). */
export interface LandingFaqItem {
  id: string;
  question: string;
  answer: string;
}

/**
 * Pedido explícito do usuário — ligado a uma faixa real de cobrança ("Faixas de cobrança" no
 * painel), o preço não é mais digitado aqui: é calculado na hora a partir de
 * `/billing-settings/public`, pra não precisar atualizar em dois lugares quando o preço real
 * mudar. "custom" é a única opção que usa `monthlyPriceCents`/`annualMonthlyPriceCents` abaixo.
 */
export type LandingPricingPlanTier = 'free' | 'pro' | 'premium' | 'custom';

/** Pedido explícito do usuário — card de planos/preços, com alternância mensal/anual. */
export interface LandingPricingPlan {
  id: string;
  name: string;
  description: string;
  billingTier: LandingPricingPlanTier;
  /** Só usado quando `billingTier` é "custom" — nas faixas reais, o preço vem da cobrança. */
  monthlyPriceCents: number;
  /** Preço mensal equivalente cobrando anual (normalmente com desconto); mesma regra acima. */
  annualMonthlyPriceCents: number;
  /** Pedido explícito do usuário — destaca o plano (selo "Mais vendido", borda própria). */
  highlighted: boolean;
  /** Uma funcionalidade por item, na ordem de exibição. */
  features: string[];
}

export type LandingPromoButtonIcon = 'whatsapp' | 'phone' | 'none';

export interface LandingPromoBlockButton {
  label: string;
  url: string;
  icon: LandingPromoButtonIcon;
}

/** Pedido explícito do usuário — bloco título + descrição + imagem, com botões de contato opcionais. */
export interface LandingPromoBlock {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  imagePosition: 'left' | 'right';
  backgroundColor: string;
  buttons: LandingPromoBlockButton[];
}

export type LandingMediaType = 'youtube' | 'image';

export interface LandingHowItWorksItem {
  id: string;
  title: string;
  description: string;
  mediaType: LandingMediaType;
  mediaUrl: string;
}

export interface LandingClient {
  id: string;
  companyName: string;
  description: string;
  imageUrl: string;
  /** Pedido explícito do usuário — link da loja desse cliente (ex. página pública no app); vazio = sem link. */
  linkUrl: string;
}

export interface LandingCompany {
  legalName: string;
  cnpj: string;
  address: string;
  phone: string;
  email: string;
  instagramUrl: string;
  termsUrl: string;
  privacyUrl: string;
  /** Cor do rodapé (`#RRGGBB`); vazio = padrão da página. */
  backgroundColor: string;
  /** Pedido explícito do usuário — liga/desliga a seção (rodapé) na home, independente dos dados estarem preenchidos. */
  visible: boolean;
}

/** specs/0186 — título e fundo de uma seção; campo vazio = padrão da página. */
export interface LandingSectionSettings {
  title: string;
  backgroundColor: string;
  backgroundImageUrl: string;
  /** Pedido explícito do usuário — liga/desliga a seção na home. */
  visible: boolean;
}

/** "Como funciona" aceita só cor de fundo (sem foto). */
export type LandingHowItWorksSettings = Omit<LandingSectionSettings, 'backgroundImageUrl'>;

export interface LandingClientsSettings extends LandingSectionSettings {
  cardColor: string;
  textColor: string;
}

/** Pedido explícito do usuário — cor do card grande que envolve título + carrossel de grupos. */
export interface LandingFeaturesSettings extends LandingSectionSettings {
  cardColor: string;
}

/** Pedido explícito do usuário — cor do card grande que envolve o seletor e os planos. */
export interface LandingPricingSettings extends LandingSectionSettings {
  cardColor: string;
}

export interface LandingSettings {
  /** Cor da barra do topo da página inicial. */
  headerColor: string;
  features: LandingFeaturesSettings;
  howItWorks: LandingHowItWorksSettings;
  clients: LandingClientsSettings;
  testimonials: LandingSectionSettings;
  faq: LandingSectionSettings;
  pricing: LandingPricingSettings;
}

/** A ordem dos arrays é a ordem de exibição. */
export interface LandingContent {
  features: LandingFeature[];
  featureGroups: LandingFeatureGroup[];
  promoBlocks: LandingPromoBlock[];
  howItWorks: LandingHowItWorksItem[];
  clients: LandingClient[];
  faq: LandingFaqItem[];
  pricingPlans: LandingPricingPlan[];
  company: LandingCompany;
  settings: LandingSettings;
}

export const EMPTY_LANDING_COMPANY: Readonly<LandingCompany> = {
  legalName: '',
  cnpj: '',
  address: '',
  phone: '',
  email: '',
  instagramUrl: '',
  termsUrl: '',
  privacyUrl: '',
  backgroundColor: '',
  visible: true,
};

export function emptyLandingSettings(): LandingSettings {
  const section = { title: '', backgroundColor: '', backgroundImageUrl: '', visible: true };
  return {
    headerColor: '',
    features: { ...section, cardColor: '' },
    howItWorks: { title: '', backgroundColor: '', visible: true },
    clients: { ...section, cardColor: '', textColor: '' },
    testimonials: { ...section },
    faq: { ...section },
    pricing: { ...section, cardColor: '' },
  };
}

export function emptyLandingContent(): LandingContent {
  return {
    features: [], featureGroups: [], promoBlocks: [], howItWorks: [], clients: [], faq: [], pricingPlans: [],
    company: { ...EMPTY_LANDING_COMPANY }, settings: emptyLandingSettings(),
  };
}

export const testimonialStatuses = ['pending', 'approved', 'rejected'] as const;
export type TestimonialStatus = (typeof testimonialStatuses)[number];

export interface LandingTestimonial {
  id: string;
  authorName: string;
  businessName: string;
  city: string;
  text: string;
  rating?: number;
  status: TestimonialStatus;
  createdAt: Date;
}

export type NewLandingTestimonial = Omit<LandingTestimonial, 'id' | 'status' | 'createdAt'>;

export interface ILandingContentRepository {
  get(): Promise<LandingContent>;
  update(content: LandingContent): Promise<LandingContent>;
}

export interface ILandingTestimonialRepository {
  create(input: NewLandingTestimonial): Promise<LandingTestimonial>;
  list(status?: TestimonialStatus): Promise<LandingTestimonial[]>;
  updateStatus(id: string, status: TestimonialStatus): Promise<LandingTestimonial | null>;
  delete(id: string): Promise<boolean>;
}

const YOUTUBE_ID = /^[\w-]{11}$/;

/** Extrai o id do vídeo de links `watch?v=`, `youtu.be/`, `embed/` e `shorts/`; `null` se não for YouTube. */
export function extractYoutubeId(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.replace(/^(www|m)\./, '');
  let candidate: string | null = null;
  if (host === 'youtu.be') {
    candidate = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, kind, id] = url.pathname.split('/');
    candidate = url.pathname === '/watch' ? url.searchParams.get('v') : kind === 'embed' || kind === 'shorts' ? id ?? null : null;
  }
  return candidate && YOUTUBE_ID.test(candidate) ? candidate : null;
}
